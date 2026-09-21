#!/usr/bin/env python3
"""Retrieve and parse Companies House bulk iXBRL filings.

The bulk archives are multi-gigabyte ZIP64 files. This importer reads only the
archive directory and the selected member by HTTP byte range, so a single club
filing can be ingested without downloading the complete archive.

The JSON output is intentionally shaped for ``finance_raw_facts``. Database
publication remains a separate, reviewed step: parsing a filing must never make
unvalidated figures public.
"""

from __future__ import annotations

import argparse
import binascii
import hashlib
import json
import re
import struct
import sys
import urllib.request
import zipfile
import zlib
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable

from lxml import etree


EOCD_SIGNATURE = b"PK\x05\x06"
ZIP64_EOCD_SIGNATURE = b"PK\x06\x06"
ZIP64_LOCATOR_SIGNATURE = b"PK\x06\x07"
CENTRAL_SIGNATURE = b"PK\x01\x02"
LOCAL_SIGNATURE = b"PK\x03\x04"
TAIL_BYTES = 131_072


@dataclass(frozen=True)
class ZipMember:
    name: str
    compression: int
    crc32: int
    compressed_size: int
    uncompressed_size: int
    local_header_offset: int


def _request(url: str, *, start: int | None = None, end: int | None = None) -> bytes:
    headers = {"User-Agent": "FixtureShark-finance-importer/1.0"}
    if start is not None:
        headers["Range"] = f"bytes={start}-{'' if end is None else end}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    if start is not None and end is not None:
        expected = end - start + 1
        if len(data) != expected:
            raise RuntimeError(f"range response was {len(data)} bytes; expected {expected}")
    return data


def _content_length(url: str) -> int:
    request = urllib.request.Request(
        url,
        method="HEAD",
        headers={"User-Agent": "FixtureShark-finance-importer/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        value = response.headers.get("Content-Length")
    if not value:
        raise RuntimeError("archive did not provide Content-Length")
    return int(value)


def _zip64_extra(extra: bytes, fields: list[str]) -> dict[str, int]:
    pos = 0
    while pos + 4 <= len(extra):
        header_id, size = struct.unpack_from("<HH", extra, pos)
        payload = extra[pos + 4 : pos + 4 + size]
        pos += 4 + size
        if header_id != 0x0001:
            continue
        values: dict[str, int] = {}
        cursor = 0
        for field in fields:
            width = 4 if field == "disk_start" else 8
            if cursor + width > len(payload):
                raise RuntimeError("truncated ZIP64 extra field")
            fmt = "<L" if width == 4 else "<Q"
            values[field] = struct.unpack_from(fmt, payload, cursor)[0]
            cursor += width
        return values
    raise RuntimeError("ZIP64 values required but ZIP64 extra field was absent")


def read_remote_zip_directory(url: str) -> list[ZipMember]:
    length = _content_length(url)
    tail_start = max(0, length - TAIL_BYTES)
    tail = _request(url, start=tail_start, end=length - 1)
    eocd_pos = tail.rfind(EOCD_SIGNATURE)
    if eocd_pos < 0:
        raise RuntimeError("ZIP end-of-central-directory record not found")

    _, _, _, entries_disk, entries_total, cd_size, cd_offset, _ = struct.unpack_from(
        "<4s4H2LH", tail, eocd_pos
    )
    if entries_total == 0xFFFF or cd_size == 0xFFFFFFFF or cd_offset == 0xFFFFFFFF:
        locator_pos = tail.rfind(ZIP64_LOCATOR_SIGNATURE, 0, eocd_pos)
        if locator_pos < 0:
            raise RuntimeError("ZIP64 locator not found")
        _, _, zip64_offset, _ = struct.unpack_from("<4sLQL", tail, locator_pos)
        if tail_start <= zip64_offset <= length - 56:
            record = tail[zip64_offset - tail_start :]
        else:
            record = _request(url, start=zip64_offset, end=zip64_offset + 55)
        values = struct.unpack_from("<4sQ2H2L4Q", record, 0)
        if values[0] != ZIP64_EOCD_SIGNATURE:
            raise RuntimeError("invalid ZIP64 end-of-central-directory record")
        entries_disk, entries_total, cd_size, cd_offset = values[6:10]

    if entries_disk != entries_total:
        raise RuntimeError("multi-disk ZIP archives are not supported")
    central = _request(url, start=cd_offset, end=cd_offset + cd_size - 1)
    members: list[ZipMember] = []
    pos = 0
    while pos + 46 <= len(central):
        values = struct.unpack_from("<4s6H3L5H2L", central, pos)
        if values[0] != CENTRAL_SIGNATURE:
            raise RuntimeError(f"invalid central-directory signature at offset {pos}")
        (
            _,
            _,
            _,
            _,
            compression,
            _,
            _,
            crc32,
            compressed_size,
            uncompressed_size,
            name_length,
            extra_length,
            comment_length,
            disk_start,
            _,
            _,
            local_header_offset,
        ) = values
        name_start = pos + 46
        name = central[name_start : name_start + name_length].decode("utf-8")
        extra = central[
            name_start + name_length : name_start + name_length + extra_length
        ]
        required: list[str] = []
        if uncompressed_size == 0xFFFFFFFF:
            required.append("uncompressed_size")
        if compressed_size == 0xFFFFFFFF:
            required.append("compressed_size")
        if local_header_offset == 0xFFFFFFFF:
            required.append("local_header_offset")
        if disk_start == 0xFFFF:
            required.append("disk_start")
        if required:
            replacements = _zip64_extra(extra, required)
            uncompressed_size = replacements.get("uncompressed_size", uncompressed_size)
            compressed_size = replacements.get("compressed_size", compressed_size)
            local_header_offset = replacements.get("local_header_offset", local_header_offset)
            disk_start = replacements.get("disk_start", disk_start)
        if disk_start != 0:
            raise RuntimeError("multi-disk ZIP member is not supported")
        members.append(
            ZipMember(
                name=name,
                compression=compression,
                crc32=crc32,
                compressed_size=compressed_size,
                uncompressed_size=uncompressed_size,
                local_header_offset=local_header_offset,
            )
        )
        pos += 46 + name_length + extra_length + comment_length
    if pos != len(central) or len(members) != entries_total:
        raise RuntimeError(
            f"central directory mismatch: parsed {len(members)} of {entries_total} entries"
        )
    return members


def extract_remote_member(url: str, member: ZipMember) -> bytes:
    header = _request(
        url,
        start=member.local_header_offset,
        end=member.local_header_offset + 29,
    )
    values = struct.unpack_from("<4s5H3L2H", header, 0)
    if values[0] != LOCAL_SIGNATURE:
        raise RuntimeError("invalid local ZIP member header")
    name_length, extra_length = values[-2:]
    data_start = member.local_header_offset + 30 + name_length + extra_length
    compressed = _request(
        url,
        start=data_start,
        end=data_start + member.compressed_size - 1,
    )
    if member.compression == 0:
        raw = compressed
    elif member.compression == 8:
        raw = zlib.decompress(compressed, -15)
    else:
        raise RuntimeError(f"unsupported ZIP compression method {member.compression}")
    if len(raw) != member.uncompressed_size:
        raise RuntimeError("uncompressed member size does not match the ZIP directory")
    if binascii.crc32(raw) & 0xFFFFFFFF != member.crc32:
        raise RuntimeError("member CRC32 check failed")
    return raw


def retrieve_filing(
    archive_url: str, company_number: str, period_end: str
) -> tuple[str, bytes, dict[str, Any]]:
    company_number = company_number.zfill(8)
    period_compact = period_end.replace("-", "")
    pattern = re.compile(
        rf"(?:^|_){re.escape(company_number)}_{re.escape(period_compact)}\.(?:html|xml|zip)$",
        re.IGNORECASE,
    )
    members = read_remote_zip_directory(archive_url)
    matches = [member for member in members if pattern.search(Path(member.name).name)]
    if len(matches) != 1:
        raise RuntimeError(f"expected one filing member, found {len(matches)}")
    selected = matches[0]
    raw = extract_remote_member(archive_url, selected)
    source_name = selected.name
    if source_name.lower().endswith(".zip"):
        with zipfile.ZipFile(BytesIO(raw)) as nested:
            nested_names = [
                name for name in nested.namelist() if name.lower().endswith((".html", ".xml"))
            ]
            if len(nested_names) != 1:
                raise RuntimeError("nested filing ZIP did not contain exactly one iXBRL/XBRL file")
            source_name = nested_names[0]
            raw = nested.read(source_name)
    metadata = {
        "archive_url": archive_url,
        "archive_member": selected.name,
        "archive_entry_count": len(members),
        "compressed_size": selected.compressed_size,
        "uncompressed_size": len(raw),
        "crc32": f"{selected.crc32:08x}",
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    return Path(source_name).name, raw, metadata


def _first_text(node: etree._Element, local_name: str) -> str | None:
    matches = node.xpath(f'.//*[local-name()="{local_name}"]')
    if not matches:
        return None
    value = " ".join("".join(matches[0].itertext()).split())
    return value or None


def _context_data(context: etree._Element) -> dict[str, Any]:
    explicit: dict[str, str] = {}
    for member in context.xpath('.//*[local-name()="explicitMember"]'):
        explicit[member.get("dimension")] = " ".join("".join(member.itertext()).split())
    typed: dict[str, str] = {}
    for member in context.xpath('.//*[local-name()="typedMember"]'):
        typed[member.get("dimension")] = " ".join("".join(member.itertext()).split())
    identifier_nodes = context.xpath('.//*[local-name()="identifier"]')
    identifier = identifier_nodes[0] if identifier_nodes else None
    dimensions: dict[str, Any] = {}
    if explicit:
        dimensions["explicit"] = explicit
    if typed:
        dimensions["typed"] = typed
    if identifier is not None:
        dimensions["entity_identifier"] = "".join(identifier.itertext()).strip()
        dimensions["entity_scheme"] = identifier.get("scheme")
    return {
        "period_start": _first_text(context, "startDate"),
        "period_end": _first_text(context, "endDate"),
        "instant_date": _first_text(context, "instant"),
        "dimensions": dimensions,
    }


def _unit_data(unit: etree._Element) -> dict[str, Any]:
    measures = [
        " ".join("".join(node.itertext()).split())
        for node in unit.xpath('.//*[local-name()="measure"]')
    ]
    numerator = [
        " ".join("".join(node.itertext()).split())
        for node in unit.xpath('.//*[local-name()="unitNumerator"]//*[local-name()="measure"]')
    ]
    denominator = [
        " ".join("".join(node.itertext()).split())
        for node in unit.xpath('.//*[local-name()="unitDenominator"]//*[local-name()="measure"]')
    ]
    return {"measures": measures, "numerator": numerator, "denominator": denominator}


def _fact_text(fact: etree._Element, continuations: dict[str, etree._Element]) -> str:
    parts = [" ".join("".join(fact.itertext()).split())]
    next_id = fact.get("continuedAt")
    seen: set[str] = set()
    while next_id:
        if next_id in seen or next_id not in continuations:
            raise RuntimeError(f"invalid iXBRL continuation chain at {next_id}")
        seen.add(next_id)
        node = continuations[next_id]
        parts.append(" ".join("".join(node.itertext()).split()))
        next_id = node.get("continuedAt")
    return " ".join(part for part in parts if part).strip()


def _numeric_value(text: str, fact: etree._Element) -> Decimal | None:
    nil_value = fact.get("{http://www.w3.org/2001/XMLSchema-instance}nil")
    if nil_value in {"true", "1"}:
        return None
    transform = (fact.get("format") or "").split(":")[-1].lower()
    if transform == "zerodash" and text.strip() in {"-", "–", "—"}:
        value = Decimal(0)
    else:
        cleaned = text.strip().replace(",", "").replace(" ", "")
        if cleaned.startswith("(") and cleaned.endswith(")"):
            cleaned = f"-{cleaned[1:-1]}"
        if not cleaned:
            return None
        try:
            value = Decimal(cleaned)
        except InvalidOperation as error:
            raise RuntimeError(f"cannot transform numeric fact value {text!r}") from error
    scale = int(fact.get("scale") or "0")
    value *= Decimal(10) ** scale
    if fact.get("sign") == "-":
        value = -abs(value)
    return value


def parse_ixbrl(source: bytes | str | Path, filing_id: int) -> dict[str, Any]:
    parser = etree.XMLParser(recover=False, huge_tree=True)
    if isinstance(source, bytes):
        root = etree.fromstring(source, parser)
    else:
        root = etree.parse(str(source), parser).getroot()
    contexts = {
        node.get("id"): _context_data(node)
        for node in root.xpath('//*[local-name()="context"]')
        if node.get("id")
    }
    units = {
        node.get("id"): _unit_data(node)
        for node in root.xpath('//*[local-name()="unit"]')
        if node.get("id")
    }
    continuations = {
        node.get("id"): node
        for node in root.xpath('//*[local-name()="continuation"]')
        if node.get("id")
    }
    fact_nodes: Iterable[etree._Element] = root.xpath(
        '//*[local-name()="nonFraction" or local-name()="nonNumeric" or local-name()="fraction"]'
    )
    facts: list[dict[str, Any]] = []
    for node in fact_nodes:
        context_ref = node.get("contextRef")
        context = contexts.get(context_ref, {})
        original_value = _fact_text(node, continuations)
        kind = etree.QName(node).localname
        numeric = _numeric_value(original_value, node) if kind == "nonFraction" else None
        unit_ref = node.get("unitRef")
        unit = units.get(unit_ref, {})
        measures = unit.get("measures", [])
        currency = next(
            (measure.split(":", 1)[1] for measure in measures if measure.startswith("iso4217:")),
            None,
        )
        dimensions = dict(context.get("dimensions", {}))
        ix_metadata = {
            key: node.get(key)
            for key in ("format", "decimals", "precision", "sign", "escape")
            if node.get(key) is not None
        }
        if measures:
            ix_metadata["unit_measures"] = measures
        if unit.get("numerator") or unit.get("denominator"):
            ix_metadata["unit_numerator"] = unit.get("numerator")
            ix_metadata["unit_denominator"] = unit.get("denominator")
        if ix_metadata:
            dimensions["_ix"] = ix_metadata
        facts.append(
            {
                "filing_id": filing_id,
                "xbrl_concept": node.get("name"),
                "context_ref": context_ref,
                "period_start": context.get("period_start"),
                "period_end": context.get("period_end"),
                "instant_date": context.get("instant_date"),
                "original_value": original_value,
                "numeric_value": format(numeric, "f") if numeric is not None else None,
                "original_unit": unit_ref,
                "currency": currency,
                "unit_scale": int(node.get("scale")) if node.get("scale") is not None else None,
                "dimensions": dimensions,
                "source_locator": f"line:{node.sourceline}",
            }
        )
    return {
        "filing_id": filing_id,
        "fact_count": len(facts),
        "context_count": len(contexts),
        "unit_count": len(units),
        "facts": facts,
    }


def _write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--source-file", type=Path)
    source.add_argument("--archive-url")
    parser.add_argument("--company-number")
    parser.add_argument("--period-end")
    parser.add_argument("--filing-id", type=int, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    if args.source_file:
        source_name = args.source_file.name
        raw = args.source_file.read_bytes()
        metadata = {
            "source_file": str(args.source_file),
            "uncompressed_size": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        }
    else:
        if not args.company_number or not args.period_end:
            parser.error("--archive-url requires --company-number and --period-end")
        source_name, raw, metadata = retrieve_filing(
            args.archive_url, args.company_number, args.period_end
        )
        (args.output_dir / source_name).write_bytes(raw)
    parsed = parse_ixbrl(raw, args.filing_id)
    parsed["source"] = metadata
    parsed["source"]["source_name"] = source_name
    _write_json(args.output_dir / "raw-facts.json", parsed)
    print(json.dumps({**metadata, "source_name": source_name, "fact_count": parsed["fact_count"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
