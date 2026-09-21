import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_finance_ixbrl import parse_ixbrl


IXBRL = b'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
 xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
 xmlns:xbrli="http://www.xbrl.org/2003/instance"
 xmlns:xbrldi="http://xbrl.org/2006/xbrldi"
 xmlns:iso4217="http://www.xbrl.org/2003/iso4217">
 <body>
  <ix:header><ix:resources>
   <xbrli:unit id="GBP"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit>
   <xbrli:context id="FY2025"><xbrli:entity>
    <xbrli:identifier scheme="https://example.test">00000001</xbrli:identifier>
    <xbrli:segment><xbrldi:explicitMember dimension="ex:Class">ex:Current</xbrldi:explicitMember></xbrli:segment>
   </xbrli:entity><xbrli:period><xbrli:startDate>2024-08-01</xbrli:startDate><xbrli:endDate>2025-07-31</xbrli:endDate></xbrli:period></xbrli:context>
  </ix:resources></ix:header>
  <ix:nonFraction name="ex:Revenue" contextRef="FY2025" unitRef="GBP" decimals="0" scale="3" format="ixt:numdotdecimal">1,234</ix:nonFraction>
  <ix:nonFraction name="ex:Loss" contextRef="FY2025" unitRef="GBP" decimals="0" scale="0" sign="-" format="ixt:numdotdecimal">50</ix:nonFraction>
  <ix:nonFraction name="ex:Zero" contextRef="FY2025" unitRef="GBP" decimals="0" scale="0" format="ixt:zerodash">-</ix:nonFraction>
  <ix:nonNumeric name="ex:Policy" contextRef="FY2025" continuedAt="continued">First</ix:nonNumeric>
  <ix:continuation id="continued">second</ix:continuation>
 </body>
</html>'''


class ParseIxbrlTests(unittest.TestCase):
    def test_parses_numeric_context_unit_and_continuation(self):
        result = parse_ixbrl(IXBRL, filing_id=9)
        self.assertEqual(result["fact_count"], 4)
        facts = {fact["xbrl_concept"]: fact for fact in result["facts"]}
        self.assertEqual(facts["ex:Revenue"]["numeric_value"], "1234000")
        self.assertEqual(facts["ex:Loss"]["numeric_value"], "-50")
        self.assertEqual(facts["ex:Zero"]["numeric_value"], "0")
        self.assertEqual(facts["ex:Policy"]["original_value"], "First second")
        self.assertEqual(facts["ex:Revenue"]["currency"], "GBP")
        self.assertEqual(facts["ex:Revenue"]["period_start"], "2024-08-01")
        self.assertEqual(
            facts["ex:Revenue"]["dimensions"]["explicit"]["ex:Class"], "ex:Current"
        )


if __name__ == "__main__":
    unittest.main()
