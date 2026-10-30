-- ============================================================================
-- FPL defensive contribution (DEFCON): production switched to the Model Lab
-- P3 count model (passed 30 Oct 2026, migrations 20261030150000 /
-- 20261030160000; switch approved by Chris 30 Oct 2026 18:31 UK).
-- Holdout 2026/27 GW1-8: Brier 0.0895 v 0.0946, log loss 0.2948 v 0.3142.
--
-- Per player and fixture, P(DEFCON) = P(count >= threshold) where the count
-- (defenders CBI + tackles, threshold 10; midfielders and forwards CBI +
-- recoveries + tackles, threshold 12 -- FPL's own definition) is negative
-- binomial with
--   mean   = rate90 x minutes / 90 x exp(beta x (share - share_bar))
--   rate90 = (count since 2025/26 + 3 x mu) / (minutes since 2025/26 / 90 + 3)
--            mu 7.762 DEF / 8.609 MID / 4.616 FWD per 90; count by the
--            player's CURRENT position's definition
--   share  = his team's share of the fixture's market expected goals
--            (fixtures.market_home_goals / market_away_goals, written before
--            the deadline by refresh_market_goals.py); neutral (0) if missing
--   share_bar = his minutes-weighted share over those past matches (closing
--            lines; 0.5 with none); beta -0.331 DEF, -0.157 MID/FWD
--   NB size 13.21 DEF / 16.47 MID / 9.33 FWD
-- averaged over the projection's own minutes distribution:
--   P(start) x [P(off <60) x S(early) + P(off 60-84) x S(60-84) + P(85+) x S(90)]
--   + P(sub appearance) x S(sub)
-- with the exit bands from fpl_player_exit_bands (Model Lab P2) and each
-- band's minutes at five 2025/26 quantile points (10/30/50/70/90%):
--   off before 60: 32 45 45 56 59; off 60-84: 62 68 73 78 82; 85+: 90;
--   sub: 2 9 16 24 37.
-- So it stays the probability of earning the DEFCON points in that fixture,
-- including the chance he doesn't play (or not enough).
--
-- Objects:
--   fpl_defcon_history_2025_26   static 2025/26 totals per FPL player code
--                                (scripts/build_defcon_seed_2025_26.py, from
--                                the vaastav files P3 used)
--   fpl_defcon_player_rates      per current-season player: totals since
--                                2025/26 + share sums; rebuilt by
--                                refresh_fpl_defcon_rates() (FPL pipeline,
--                                before the fixtures; and once below)
--   market_goal_lambdas()        independent-Poisson goals matching 1X2 +
--                                over 2.5 (as lab_p3_defcon.market_lambdas)
--   fpl_nb_upper_tail()          P(X >= t) for a negative binomial
--   fpl_defcon_probability()     the minutes mixture above
--   fpl_defensive_contribution_projection_leaguewide   same columns and
--                                meaning; shrunk_events90 is now the P3 rate
--                                per 90 (official count, both seasons)
-- ============================================================================

-- ---------------------------------------------------------------- 2025/26 seed
create table if not exists public.fpl_defcon_history_2025_26 (
  fpl_code integer primary key,
  appearances integer not null,
  minutes integer not null,
  cbi integer not null,
  tackles integer not null,
  recoveries integer not null,
  share_minutes integer not null,
  share_sum numeric not null
);
comment on table public.fpl_defcon_history_2025_26 is
  '2025/26 Premier League totals per FPL player code (every appearance with 1+ minute): minutes, CBI, tackles, recoveries, and minutes / minutes x team market goal share (closing lines). Static; built by scripts/build_defcon_seed_2025_26.py from the vaastav files Model Lab P3 used. Read by refresh_fpl_defcon_rates().';
alter table public.fpl_defcon_history_2025_26 enable row level security;
drop policy if exists "fpl_defcon_history_2025_26 public read" on public.fpl_defcon_history_2025_26;
create policy "fpl_defcon_history_2025_26 public read" on public.fpl_defcon_history_2025_26 for select using (true);
grant select on public.fpl_defcon_history_2025_26 to anon, authenticated;
grant select, insert, update, delete on public.fpl_defcon_history_2025_26 to service_role;

insert into public.fpl_defcon_history_2025_26 (fpl_code, appearances, minutes, cbi, tackles, recoveries, share_minutes, share_sum) values
(15157,20,772,25,15,40,772,396.5878),
(17761,37,3330,325,51,90,3330,1567.5522),
(44699,7,40,0,0,2,40,14.0144),
(50175,37,2249,39,24,49,2249,1208.0008),
(54469,22,1073,55,15,29,1073,501.2721),
(56979,32,1911,58,27,98,1911,920.1306),
(57328,10,592,34,16,17,592,274.5521),
(58621,36,3095,156,56,155,3095,1005.6263),
(59735,22,1980,30,1,202,1980,938.2819),
(59949,5,19,2,0,2,19,8.1197),
(60307,19,1636,40,29,76,1636,874.9258),
(60689,15,896,14,1,14,896,450.5033),
(61256,34,2575,130,90,135,2575,1475.6960),
(67089,35,3150,59,1,291,3150,1030.9311),
(72147,7,585,10,0,53,585,282.7742),
(75115,32,1234,10,4,27,1234,533.4024),
(76357,24,756,12,7,42,756,329.5592),
(77794,21,1586,57,25,74,1586,879.6053),
(78916,29,2195,185,40,76,2195,1178.8913),
(79602,3,270,5,0,26,270,85.8785),
(80201,38,3420,46,4,318,3420,1600.1018),
(80801,25,2094,59,43,116,2094,978.8152),
(83299,33,2837,196,35,135,2837,1483.0965),
(84182,20,1800,30,0,142,1800,717.3950),
(84450,34,2901,134,50,178,2901,1174.6080),
(85633,31,2667,26,1,197,2667,1227.3364),
(87835,11,786,50,16,28,786,255.6313),
(88248,3,270,1,0,8,270,132.4970),
(88894,21,844,15,14,45,844,437.3755),
(91651,6,125,6,2,10,125,83.5656),
(91889,8,407,7,2,10,407,154.7658),
(95658,23,1649,129,22,62,1649,891.7220),
(97032,38,3420,329,23,87,3420,2114.3622),
(97299,9,436,29,1,19,436,283.4555),
(98747,27,2416,35,1,254,2416,1311.9206),
(98980,32,2835,27,0,272,2835,1505.5680),
(101148,2,19,5,0,0,19,8.4727),
(101178,18,1092,44,16,49,1092,387.1759),
(101188,31,1842,77,36,63,1842,955.1828),
(101982,12,1080,24,2,107,1080,390.4277),
(102057,36,2183,42,35,55,2183,1001.5504),
(105717,3,125,6,4,3,125,44.3202),
(106611,33,2588,265,37,87,2588,1205.3402),
(106760,38,3220,149,75,105,3220,1787.9214),
(107265,1,45,1,0,4,45,26.3246),
(108413,31,1560,54,28,66,1560,739.5023),
(109345,4,38,0,2,3,38,22.4791),
(109646,16,788,80,17,22,788,486.9422),
(109745,1,90,3,0,8,90,54.4926),
(110504,12,634,11,11,18,634,242.1783),
(111234,38,3420,52,2,313,3420,1590.1152),
(111317,31,1188,19,19,56,1188,586.8343),
(111478,24,1047,68,31,40,1047,563.1815),
(111773,1,45,1,0,0,45,29.3921),
(113564,2,8,2,1,1,8,2.1692),
(114243,33,1606,27,16,47,1606,860.7515),
(114283,20,1627,27,20,88,1627,786.4481),
(115556,3,136,9,5,5,136,78.7731),
(116216,31,1997,26,27,80,1997,1421.7630),
(116535,26,2340,37,0,229,2340,1505.8857),
(118748,27,2144,11,17,81,2144,1332.4676),
(119471,16,1089,101,14,42,1089,638.7811),
(121709,1,90,1,0,9,90,45.1485),
(122798,24,1165,43,12,40,1165,737.9513),
(122806,30,2136,32,29,89,2136,1126.9642),
(124165,1,27,0,0,1,27,12.2741),
(126184,18,686,37,9,17,686,462.9500),
(128295,7,101,9,3,4,101,68.0141),
(135720,24,1489,165,27,45,1489,734.3708),
(141746,35,3065,67,53,167,3065,1703.5820),
(149065,23,2070,46,1,217,2070,750.6442),
(149484,17,1322,102,5,47,1322,703.7729),
(152551,31,1722,90,28,102,1722,834.1991),
(153133,29,2420,35,27,126,2420,1145.5296),
(153366,7,89,1,0,5,89,28.4613),
(153682,36,2674,66,29,82,2674,1257.5239),
(154296,33,2192,100,110,92,2192,1042.3028),
(154561,37,3330,37,1,304,3330,2305.3084),
(154566,15,997,16,22,33,997,457.7170),
(155408,18,872,56,25,62,872,442.1638),
(155503,3,212,4,0,22,212,120.0834),
(155511,14,1141,14,8,15,1141,387.7612),
(158499,26,978,34,27,62,978,493.2723),
(158534,23,1378,49,44,59,1378,617.8391),
(158983,8,170,13,7,3,170,108.9416),
(159506,18,1587,99,31,81,1587,783.0526),
(159533,24,376,2,2,14,376,153.3357),
(165809,38,2869,62,54,146,2869,1893.5460),
(166477,30,1838,106,40,56,1838,823.0838),
(166989,25,1857,51,58,94,1857,987.2791),
(167074,22,1791,100,65,82,1791,868.9912),
(167512,12,565,37,6,10,565,222.0187),
(167887,33,1752,74,48,64,1752,545.9618),
(168636,23,214,15,1,7,214,115.0884),
(169528,22,1487,88,48,98,1487,705.2453),
(171287,21,594,36,10,20,594,388.2350),
(171314,26,2139,154,13,74,2139,1434.4659),
(172567,18,1513,68,32,73,1513,510.8422),
(172649,37,3330,55,1,298,3330,1584.4250),
(172780,3,34,0,1,4,34,17.3186),
(173879,12,278,3,4,6,278,148.3457),
(174592,23,1058,6,11,50,1058,354.7130),
(174594,31,1065,15,12,30,1065,436.9563),
(174874,33,2882,284,45,114,2882,1336.3882),
(177815,35,2721,49,10,46,2721,1274.3420),
(178186,38,3406,73,49,159,3406,1433.9257),
(178301,37,2833,23,22,49,2833,1484.5549),
(179268,34,2706,127,55,113,2706,1576.8877),
(179458,28,1014,20,12,31,1014,349.5056),
(180135,23,1003,29,38,43,1003,471.0112),
(180736,34,2780,230,35,119,2780,1645.3481),
(180804,14,1201,106,14,40,1201,398.8257),
(180974,27,1950,73,43,122,1950,1119.2578),
(183656,2,2,0,0,1,2,1.2273),
(184029,24,1363,13,19,70,1363,924.7724),
(184254,31,2790,35,1,247,2790,1329.7732),
(184341,23,1010,19,24,59,1010,537.6629),
(184349,27,1816,96,48,74,1816,843.5212),
(184667,17,942,47,7,19,942,465.3959),
(184754,26,1439,29,10,57,1439,504.7082),
(191866,27,1805,155,37,59,1805,836.5414),
(194010,25,1322,53,15,72,1322,643.9014),
(195384,22,1024,30,26,57,1024,695.8308),
(195546,36,1753,39,49,109,1753,911.3230),
(197024,6,175,4,1,10,175,77.2480),
(198869,12,699,38,15,28,699,477.3503),
(199598,35,3119,151,81,184,3119,1417.9652),
(199670,1,2,0,1,0,2,1.0724),
(199796,35,3016,120,66,88,3016,1617.9485),
(199798,34,3035,174,22,108,3035,1607.3397),
(200089,24,972,17,20,52,972,479.1076),
(200617,19,547,9,7,19,547,225.0418),
(200641,10,118,3,4,16,118,64.3729),
(200720,37,3330,48,1,301,3330,1604.7424),
(200785,25,1769,83,53,96,1769,894.9421),
(200834,32,2784,204,69,131,2784,1127.3215),
(201595,16,1440,16,0,100,1440,600.0387),
(201658,34,2732,62,39,150,2732,1337.1527),
(201666,37,1951,20,13,67,1951,1063.7358),
(201895,33,2797,280,32,103,2797,1151.5374),
(202993,26,1880,91,56,131,1880,932.9349),
(204120,12,799,62,16,54,799,426.1623),
(204480,36,3093,127,69,180,3093,2133.6218),
(204580,25,1434,71,27,85,1434,685.2539),
(204646,21,640,2,4,10,640,342.4579),
(204716,36,3090,240,53,118,3090,1902.6790),
(204936,34,3060,42,0,236,3060,2035.9488),
(204968,22,602,35,16,18,602,258.5589),
(205533,12,414,13,8,17,414,210.0526),
(205651,14,418,7,4,19,418,293.8286),
(206325,5,352,14,10,17,352,202.3660),
(206915,34,1923,53,40,144,1923,1186.5209),
(207189,35,2904,91,57,132,2904,1378.4578),
(207283,36,2239,62,40,118,2239,1117.8843),
(208706,29,2456,55,62,134,2456,1382.0881),
(208912,11,496,72,4,10,496,149.4368),
(209036,35,3150,232,46,139,3150,1806.4950),
(209041,12,457,6,10,17,457,160.6565),
(209046,30,1838,24,14,68,1838,875.3785),
(209243,23,863,11,7,26,863,442.8233),
(209244,33,2078,24,34,102,2078,1404.3992),
(209289,37,1909,42,35,71,1909,891.3405),
(209365,13,1170,88,19,40,1170,615.9596),
(209400,28,1899,38,62,108,1899,930.0078),
(210156,17,480,6,2,18,480,203.6815),
(210462,28,2073,95,58,114,2073,986.6982),
(210494,2,180,14,1,8,180,82.8761),
(212314,26,1730,63,49,71,1730,779.6294),
(212319,32,1954,60,27,60,1954,971.9529),
(214048,21,1559,144,16,43,1559,626.1275),
(214225,35,2952,237,37,85,2952,1324.8411),
(214590,25,2080,141,33,75,2080,833.4800),
(215059,35,3040,27,2,302,3040,1799.2887),
(215136,37,3203,151,96,164,3203,1498.9119),
(215379,38,3332,106,103,306,3332,1561.9221),
(215413,31,2629,44,52,134,2629,1229.9623),
(215439,35,2190,115,43,66,2190,949.6913),
(215711,13,450,7,10,31,450,220.7973),
(216051,34,2609,127,53,135,2609,1479.6743),
(216055,31,2100,111,89,113,2100,689.0990),
(216094,21,1032,19,11,52,1032,650.3176),
(216646,19,517,3,5,14,517,298.9184),
(218328,23,1067,18,6,57,1067,505.4614),
(218364,7,99,6,3,3,99,40.6594),
(219168,14,694,10,7,13,694,439.1900),
(219249,6,202,3,5,2,202,114.9038),
(219847,12,577,10,8,14,577,385.7493),
(219924,13,812,55,6,19,812,374.4506),
(220237,25,1834,195,21,89,1834,984.0937),
(220362,14,1254,74,14,32,1254,565.7415),
(220566,21,1510,57,42,107,1510,943.1997),
(220627,29,1893,128,55,70,1893,855.6587),
(221389,5,437,4,0,26,437,206.3552),
(221399,11,262,6,5,13,262,135.2102),
(221466,37,3288,357,62,155,3288,1608.2822),
(221632,23,1869,139,58,88,1869,938.7693),
(221820,18,1229,86,19,68,1229,691.9213),
(222531,37,3101,48,20,110,3101,1451.5705),
(222683,20,945,9,10,46,945,444.5274),
(222690,3,15,1,3,3,15,6.8629),
(222694,34,2935,258,39,117,2935,1325.2157),
(223094,35,2953,48,15,41,2953,1947.5513),
(223336,3,13,2,0,0,13,5.2832),
(223340,31,2218,28,40,116,2218,1573.2192),
(223434,4,103,13,0,3,103,38.0822),
(223541,26,317,13,8,9,317,204.9466),
(223827,29,2144,231,33,69,2144,864.7125),
(224024,18,1513,30,40,76,1513,607.4728),
(224117,36,2217,23,7,55,2217,1537.0086),
(224967,33,2959,183,48,107,2959,1383.5087),
(225321,12,1003,10,0,89,1003,549.3014),
(225796,29,1957,80,48,101,1957,1097.3366),
(226182,34,2795,112,66,133,2795,1287.1906),
(226597,32,2750,239,38,64,2750,1896.6477),
(226944,18,1410,46,38,65,1410,733.5877),
(227127,11,600,26,18,30,600,280.2606),
(227444,38,3375,281,30,107,3375,1580.0705),
(229384,7,156,2,6,14,156,65.2610),
(230001,20,977,66,28,46,977,537.3442),
(230046,21,913,31,22,52,913,476.2228),
(230376,23,1117,24,43,58,1117,434.4867),
(231057,26,1239,33,28,44,1239,446.2634),
(231065,4,318,37,5,11,318,124.2650),
(231416,37,3130,113,57,130,3130,1646.4364),
(231480,29,2552,165,51,66,2552,940.6202),
(231747,32,2210,58,10,57,2210,1061.7594),
(232112,22,876,45,46,51,876,471.8236),
(232185,28,2173,40,18,79,2173,1009.6764),
(232413,33,1885,22,19,79,1885,1280.0793),
(232653,28,1441,23,41,85,1441,739.7481),
(232787,16,1183,29,22,73,1183,587.4097),
(232826,26,1798,16,19,56,1798,992.3884),
(232859,30,2049,72,44,112,2049,1009.1015),
(232892,30,2532,143,62,119,2532,1203.7831),
(232928,38,3413,154,119,185,3413,1587.6286),
(233963,31,2532,273,40,103,2532,1063.1896),
(235826,16,244,2,2,10,244,106.3782),
(242880,8,470,41,7,16,470,254.5127),
(242882,18,1275,97,20,48,1275,624.1290),
(242898,34,1710,37,29,55,1710,763.3501),
(243016,37,2654,64,53,112,2654,1629.5776),
(243298,36,2736,37,28,87,2736,1678.3514),
(243526,32,2637,119,65,112,2637,1172.2329),
(243571,7,238,21,10,14,238,96.8105),
(244042,21,987,29,8,15,987,490.9019),
(244723,38,3253,145,100,187,3253,1566.8726),
(244850,37,3280,49,42,139,3280,1735.9206),
(244851,26,1954,27,25,83,1954,1109.1540),
(244858,6,100,0,3,5,100,39.1615),
(244954,21,1673,90,22,79,1673,882.9192),
(246301,15,935,101,16,40,935,414.4587),
(247348,29,2400,124,72,97,2400,1152.8862),
(247412,36,2301,49,9,37,2301,948.5673),
(247632,34,2629,19,19,84,2629,1516.5582),
(247670,18,1384,29,11,31,1384,627.1473),
(247693,30,1655,22,28,64,1655,793.8639),
(247955,28,1681,76,37,73,1681,634.4287),
(248056,28,1307,38,27,82,1307,594.3778),
(248857,26,1205,14,21,35,1205,803.5022),
(248875,30,1773,15,23,88,1773,1185.5507),
(249231,36,1960,51,23,96,1960,964.8317),
(250199,27,1168,29,56,58,1168,502.2881),
(424044,1,16,1,1,2,16,4.2052),
(424876,36,3232,96,56,186,3232,1983.0011),
(427623,33,2825,257,54,65,2825,1367.2993),
(427637,37,2449,36,50,130,2449,1117.4526),
(428580,6,88,3,2,5,88,37.9510),
(429414,1,14,1,0,1,14,6.2234),
(430871,33,2493,46,39,126,2493,1424.2070),
(431248,28,2356,164,33,78,2356,834.6112),
(431639,29,1764,49,17,33,1764,569.5786),
(432422,35,2534,75,35,147,2534,1352.1298),
(432714,14,288,7,7,18,288,128.6461),
(432720,4,360,6,2,35,360,236.9269),
(432830,35,2971,287,32,139,2971,1464.9083),
(433036,28,1623,32,10,58,1623,1082.3974),
(433154,22,1161,26,23,62,1161,531.7054),
(433312,13,872,39,21,20,872,354.5759),
(434399,25,1966,125,39,90,1966,816.1975),
(434752,25,1888,194,25,63,1888,846.3133),
(435973,26,1361,27,16,42,1361,456.8783),
(435997,28,1553,29,23,61,1553,730.1862),
(437499,35,3085,310,60,96,3085,1472.0849),
(437505,32,1148,17,11,23,1148,446.0773),
(437730,37,3200,49,45,142,3200,1784.8337),
(437738,12,429,41,8,13,429,173.6131),
(437748,6,37,0,1,4,37,12.3542),
(438234,21,691,6,13,20,691,455.0026),
(440089,33,2046,45,57,139,2046,1021.5423),
(440323,24,843,12,6,26,843,276.8005),
(440993,32,2781,38,67,178,2781,1294.8192),
(441164,34,2793,142,76,132,2793,1403.9574),
(441191,17,1326,46,22,81,1326,720.8802),
(441264,31,1920,21,9,44,1920,792.3273),
(441266,36,2991,112,59,127,2991,1832.0190),
(441271,8,423,27,13,16,423,176.8080),
(441302,30,1590,85,43,82,1590,838.2229),
(444102,36,2741,42,13,80,2741,1339.4221),
(444145,30,1065,13,12,52,1065,707.2354),
(444180,37,2717,49,42,141,2717,884.7361),
(444463,25,1718,187,19,81,1718,984.7730),
(444765,32,2761,249,23,109,2761,1331.6040),
(444884,5,110,2,0,4,110,60.8777),
(445122,30,2452,82,66,97,2452,1702.3253),
(446008,33,2611,23,25,91,2611,1450.7154),
(448047,36,3114,51,53,140,3114,1816.6182),
(448089,35,2829,87,107,193,2829,992.8888),
(448104,25,1787,123,48,63,1787,1222.9091),
(448514,17,971,32,35,49,971,638.4897),
(449027,10,867,10,1,76,867,487.8434),
(449434,32,1302,9,14,32,1302,703.6743),
(449871,25,1755,99,48,72,1755,873.5290),
(450070,31,2470,50,45,120,2470,1072.6670),
(450539,1,1,0,0,0,1,0.4702),
(451302,6,540,7,0,39,540,280.4406),
(451340,25,1714,27,18,62,1714,896.1747),
(456512,24,1167,24,22,50,1167,553.3541),
(457569,38,3420,62,0,285,3420,1679.1501),
(458249,24,607,14,9,21,607,355.0290),
(460028,3,225,22,3,9,225,121.8491),
(460842,19,1535,9,29,95,1535,762.3057),
(461188,20,1574,114,27,69,1574,531.4267),
(461195,8,319,20,8,8,319,130.6132),
(461199,14,399,6,5,22,399,171.4199),
(462116,23,1817,128,37,89,1817,737.2324),
(462424,31,2614,158,35,113,2614,1855.3186),
(463034,28,1092,12,5,25,1092,655.2548),
(463067,32,1776,38,32,61,1776,906.9320),
(463936,16,486,6,8,15,486,300.4342),
(463981,29,2102,221,39,74,2102,1021.8324),
(465247,32,2880,26,1,224,2880,1622.3412),
(465351,34,2861,138,57,166,2861,1916.5797),
(465527,27,1219,17,29,65,1219,415.8100),
(465642,35,2963,248,44,118,2963,1591.8089),
(465680,9,89,1,1,4,89,37.2248),
(465694,25,1561,74,42,90,1561,1073.5478),
(465730,30,1404,42,22,68,1404,758.7324),
(466052,33,1772,16,26,93,1772,1195.1766),
(466075,26,1697,70,32,74,1697,1170.7148),
(466525,29,2369,81,65,120,2369,1060.0654),
(467189,18,1620,20,0,168,1620,721.5613),
(467779,26,1901,101,66,102,1901,994.9206),
(469130,4,126,4,0,3,126,68.5418),
(469142,36,3210,264,53,113,3210,1677.9285),
(469272,29,1259,13,18,38,1259,391.6750),
(470313,33,1896,28,24,53,1896,1056.9463),
(470315,7,353,15,12,15,353,133.4858),
(472713,21,679,36,15,35,679,323.3949),
(472769,34,2643,105,67,108,2643,1754.4936),
(475168,35,2658,39,27,72,2658,1543.8663),
(476887,14,549,3,4,28,549,256.8918),
(477064,11,401,14,5,15,401,264.7805),
(477424,18,1370,86,17,49,1370,907.8703),
(477555,23,1030,12,21,43,1030,595.3607),
(477717,34,2933,290,44,114,2933,939.8420),
(478969,19,1539,150,24,49,1539,489.9909),
(480455,10,678,53,14,30,678,319.3312),
(481655,38,2991,123,68,116,2991,2045.7481),
(482442,26,1388,74,32,77,1388,630.6194),
(482609,34,2255,74,52,123,2255,1291.3840),
(482973,37,2293,38,24,61,2293,1037.3360),
(483081,22,954,23,22,33,954,381.2840),
(484420,36,2930,77,89,153,2930,1203.8237),
(485047,21,1340,114,30,52,1340,608.7876),
(485055,7,630,10,0,33,630,337.5094),
(485337,21,909,16,24,43,909,471.8613),
(485711,30,1630,20,5,39,1630,910.0855),
(486385,37,1551,49,14,26,1551,737.9024),
(486520,23,1318,40,23,51,1318,531.1208),
(486672,33,2796,102,87,177,2796,1627.6630),
(487053,20,1335,37,31,70,1335,649.5314),
(487676,38,3032,135,68,102,3032,1222.5885),
(487838,30,2176,119,54,134,2176,1170.7019),
(488024,34,2074,30,36,101,2074,1006.5237),
(488213,33,1402,50,7,26,1402,507.3162),
(489639,38,3420,32,1,332,3420,1797.2806),
(489706,21,785,13,25,34,785,378.1621),
(489888,31,1074,26,36,61,1074,529.5249),
(490094,29,1477,43,68,78,1477,671.5977),
(490142,22,1162,51,29,39,1162,454.8136),
(490145,2,7,0,0,1,7,4.1813),
(490721,35,2359,108,64,115,2359,850.3897),
(490885,1,8,0,0,0,8,3.7486),
(491007,3,26,1,6,1,26,11.7499),
(491279,35,3041,174,38,121,3041,1518.3073),
(492777,15,928,46,19,43,928,548.3864),
(492831,4,69,0,0,1,69,22.4670),
(492859,23,521,15,18,26,521,214.7847),
(493105,24,1261,10,16,45,1261,731.5693),
(493125,10,515,70,5,14,515,185.1922),
(493250,32,2339,48,38,112,2339,1313.5241),
(493362,28,1747,28,34,87,1747,834.5745),
(494307,2,135,8,3,4,135,84.9069),
(494521,38,3378,199,102,188,3378,1659.9065),
(494595,33,2374,26,34,116,2374,1451.6000),
(494960,21,1825,101,52,69,1825,597.7100),
(496208,8,105,1,6,6,105,53.8942),
(496221,34,2552,70,70,163,2552,1216.1078),
(496661,14,349,11,7,22,349,168.1789),
(497606,2,25,1,2,1,25,8.0801),
(497949,22,1042,40,10,26,1042,363.3177),
(498016,35,3150,37,0,333,3150,1287.9721),
(499169,20,697,17,8,30,697,487.0928),
(499175,6,165,1,2,10,165,122.6231),
(499309,10,265,4,0,4,265,159.4000),
(499604,15,1110,28,11,43,1110,562.5403),
(499716,1,1,0,0,0,1,0.2711),
(499726,1,14,0,0,2,14,3.7950),
(500040,20,986,63,32,35,986,632.3454),
(500151,14,1025,37,20,27,1025,438.4449),
(501837,27,2137,159,60,93,2137,736.9215),
(502500,38,3282,84,37,93,3282,1612.5074),
(502697,20,679,13,14,43,679,299.5057),
(503139,37,2848,133,60,193,2848,1369.0985),
(503301,31,1676,20,22,87,1676,804.8164),
(503714,35,2330,63,51,100,2330,779.6713),
(507433,1,90,0,0,7,90,56.2643),
(508395,37,2652,83,69,186,2652,1270.9529),
(508479,5,378,3,0,34,378,172.5524),
(509291,35,2760,90,81,212,2760,975.6233),
(509416,29,1921,54,47,124,1921,1005.6438),
(510281,24,817,11,9,39,817,562.4319),
(510362,19,1423,120,23,53,1423,483.2781),
(510500,1,11,1,2,0,11,6.7306),
(510663,28,1797,32,11,42,1797,1158.0390),
(511499,31,1334,19,20,72,1334,679.7861),
(512462,37,3118,174,57,114,3118,1443.9445),
(513418,35,2744,54,42,94,2744,1336.8400),
(513433,18,708,4,14,40,708,379.6162),
(513466,16,675,15,25,28,675,294.3230),
(514254,32,2117,49,77,112,2117,1077.9886),
(514356,12,374,9,8,20,374,200.6719),
(515046,3,270,6,0,33,270,98.9083),
(515597,28,1042,34,26,43,1042,520.3772),
(515621,9,550,37,8,32,550,248.2951),
(516895,28,1653,56,36,95,1653,924.8455),
(516939,14,1100,93,32,65,1100,395.3807),
(518030,3,270,4,0,21,270,87.7858),
(519634,2,133,8,4,6,133,59.6896),
(519895,7,164,5,2,4,164,55.8247),
(519913,2,17,0,0,2,17,7.3131),
(523705,31,1834,79,29,62,1834,653.0213),
(530318,1,3,0,0,0,3,1.0581),
(530335,14,819,18,26,28,819,375.0505),
(532529,27,1736,35,18,61,1736,890.2330),
(532605,27,1247,44,37,48,1247,714.0898),
(533463,32,2271,76,24,85,2271,1123.8783),
(535301,31,1646,67,37,105,1646,873.4876),
(535818,14,649,13,11,21,649,251.4592),
(536109,13,656,44,30,35,656,287.8500),
(536661,8,401,16,10,9,401,160.7422),
(536916,4,81,2,1,3,81,40.5877),
(538207,24,805,2,6,23,805,424.2075),
(543295,1,45,0,2,2,45,17.4656),
(544877,34,2251,93,41,88,2251,1373.7378),
(545477,2,7,4,0,0,7,3.3641),
(547027,20,1403,17,14,48,1403,576.6288),
(547037,3,107,2,5,4,107,62.6879),
(547676,1,2,2,0,0,2,1.0204),
(547701,24,1471,65,11,56,1471,681.4115),
(547719,23,1493,57,29,69,1493,815.7242),
(549067,3,165,9,4,10,165,64.0360),
(549074,6,57,0,1,4,57,26.3082),
(549329,20,1405,64,29,86,1405,471.2544),
(549912,28,1553,20,11,61,1553,626.1448),
(550090,5,193,16,2,6,193,86.8419),
(550615,15,351,2,7,14,351,188.7635),
(550839,24,972,14,10,53,972,488.5614),
(550864,32,1730,126,30,73,1730,984.8123),
(551206,1,9,0,0,0,9,2.6094),
(551210,22,1139,63,36,50,1139,592.1586),
(551226,36,3017,84,103,182,3017,1265.1506),
(551483,31,2315,80,68,135,2315,1134.7059),
(554197,18,758,15,13,29,758,316.3019),
(556637,1,1,0,0,0,1,0.5990),
(559962,1,8,0,0,1,8,2.1293),
(560262,33,1663,42,9,61,1663,838.2307),
(560552,26,1030,17,21,48,1030,499.0255),
(564406,20,751,7,5,14,751,303.3801),
(564940,22,971,33,40,54,971,365.1356),
(565431,2,58,2,0,1,58,19.9771),
(567119,1,1,1,0,0,1,0.5559),
(567121,1,1,0,0,0,1,0.5990),
(570526,23,955,18,22,39,955,499.5840),
(574458,3,100,7,1,2,100,34.2379),
(575458,9,514,38,9,13,514,206.2160),
(575476,25,2130,188,35,102,2130,994.5057),
(575901,3,34,0,1,4,34,17.6943),
(576620,1,15,0,0,0,15,10.8451),
(576628,3,40,0,1,2,40,18.0602),
(577016,17,657,33,11,26,657,379.6217),
(577114,5,121,2,1,8,121,46.1761),
(577285,2,25,0,0,1,25,13.6296),
(577669,33,2891,89,46,113,2891,1184.3831),
(577725,32,1290,22,26,59,1290,613.5423),
(578153,21,1427,96,27,75,1427,924.0831),
(586309,38,1898,34,6,34,1898,867.9725),
(590014,1,90,2,1,4,90,35.5074),
(590039,2,25,0,0,1,25,17.0967),
(591386,6,21,0,1,4,21,14.1073),
(592031,34,2389,33,56,96,2389,1265.9522),
(593174,1,1,0,0,0,1,0.5972),
(596054,3,12,0,0,1,12,3.4923),
(596777,26,1440,50,48,77,1440,734.8058),
(597320,3,92,3,1,3,92,47.7116),
(599303,1,13,0,0,0,13,6.5068),
(602903,6,113,5,0,6,113,46.6288),
(606689,4,38,0,0,5,38,20.6408),
(606745,17,920,71,22,39,920,517.3493),
(606775,1,6,0,0,0,6,1.5769),
(606798,6,83,5,5,4,83,25.6455),
(606921,4,40,0,3,2,40,21.1682),
(607464,37,3258,151,68,163,3258,1577.2494),
(608181,9,132,2,3,10,132,68.1884),
(609873,13,524,13,13,24,524,235.3086),
(611922,19,547,7,4,19,547,333.2325),
(613804,32,2706,161,44,125,2706,1130.3801),
(614574,9,135,8,1,8,135,69.2597),
(616077,6,152,1,2,13,152,102.4972),
(616221,4,142,6,0,3,142,53.3264),
(619734,1,45,0,1,2,45,32.1649),
(620487,7,367,34,5,13,367,196.0779),
(624773,22,839,9,11,36,839,490.1289),
(630699,11,67,3,6,7,67,28.6630),
(631786,7,49,0,1,4,49,18.3910),
(640419,1,1,0,0,0,1,0.3518),
(641221,9,257,11,8,11,257,85.1793),
(643135,9,228,1,1,10,228,90.8652),
(645618,1,16,0,0,1,16,9.1320),
(647671,27,1787,33,27,77,1787,621.1786),
(647850,21,351,5,11,25,351,205.3198),
(651426,20,1331,129,40,54,1331,584.6983),
(653481,3,47,1,0,3,47,24.9702),
(660392,14,159,3,1,9,159,76.3680),
(672492,2,7,0,1,2,7,3.0956),
(685628,1,16,1,1,0,16,7.6281),
(699989,1,38,0,1,2,38,18.3894)
on conflict (fpl_code) do nothing;

-- ------------------------------------------------------------ math helpers
-- Independent-Poisson expected goals (home, away) whose 1X2 (normalised) and
-- P(over 2.5) best match the prices: least squares on the three residuals,
-- Gauss-Newton in log space from (1.4, 1.2), goals 0-10 -- the same problem
-- lab_p3_defcon.market_lambdas() solves with scipy.
create or replace function public.market_goal_residuals(z_home double precision, z_away double precision,
  p_home double precision, p_away double precision, p_over double precision)
returns double precision[]
language plpgsql immutable strict parallel safe
set search_path = public, pg_temp
as $$
declare
  lh double precision := exp(z_home);
  la double precision := exp(z_away);
  a double precision[] := array_fill(0::double precision, array[11]);
  b double precision[] := array_fill(0::double precision, array[11]);
  hw double precision := 0;
  aw double precision := 0;
  un double precision := 0;
  i integer;
  j integer;
begin
  a[1] := exp(-lh);
  b[1] := exp(-la);
  for i in 1..10 loop
    a[i + 1] := a[i] * lh / i;
    b[i + 1] := b[i] * la / i;
  end loop;
  for i in 0..10 loop
    for j in 0..10 loop
      if i > j then hw := hw + a[i + 1] * b[j + 1];
      elsif j > i then aw := aw + a[i + 1] * b[j + 1];
      end if;
      if i + j <= 2 then un := un + a[i + 1] * b[j + 1]; end if;
    end loop;
  end loop;
  return array[hw - p_home, aw - p_away, 1 - un - p_over];
end $$;

create or replace function public.market_goal_lambdas(p_home double precision, p_draw double precision,
  p_away double precision, p_over double precision,
  out lambda_home double precision, out lambda_away double precision)
language plpgsql immutable strict parallel safe
set search_path = public, pg_temp
as $$
declare
  tot double precision := p_home + p_draw + p_away;
  ph double precision := p_home / tot;
  pa double precision := p_away / tot;
  z1 double precision := ln(1.4);
  z2 double precision := ln(1.2);
  h constant double precision := 1e-6;
  r double precision[];
  r1 double precision[];
  r2 double precision[];
  j1 double precision[];
  j2 double precision[];
  a11 double precision; a12 double precision; a22 double precision;
  g1 double precision; g2 double precision; det double precision;
  d1 double precision; d2 double precision;
  it integer;
  k integer;
begin
  for it in 1..60 loop
    r := public.market_goal_residuals(z1, z2, ph, pa, p_over);
    r1 := public.market_goal_residuals(z1 + h, z2, ph, pa, p_over);
    r2 := public.market_goal_residuals(z1, z2 + h, ph, pa, p_over);
    j1 := array[(r1[1] - r[1]) / h, (r1[2] - r[2]) / h, (r1[3] - r[3]) / h];
    j2 := array[(r2[1] - r[1]) / h, (r2[2] - r[2]) / h, (r2[3] - r[3]) / h];
    a11 := 0; a12 := 0; a22 := 0; g1 := 0; g2 := 0;
    for k in 1..3 loop
      a11 := a11 + j1[k] * j1[k];
      a12 := a12 + j1[k] * j2[k];
      a22 := a22 + j2[k] * j2[k];
      g1 := g1 + j1[k] * r[k];
      g2 := g2 + j2[k] * r[k];
    end loop;
    a11 := a11 * (1 + 1e-9); a22 := a22 * (1 + 1e-9);
    det := a11 * a22 - a12 * a12;
    exit when det = 0;
    d1 := -(a22 * g1 - a12 * g2) / det;
    d2 := -(a11 * g2 - a12 * g1) / det;
    -- keep steps sane far from the solution
    d1 := greatest(-1, least(1, d1));
    d2 := greatest(-1, least(1, d2));
    z1 := z1 + d1;
    z2 := z2 + d2;
    exit when abs(d1) < 1e-12 and abs(d2) < 1e-12;
  end loop;
  lambda_home := exp(z1);
  lambda_away := exp(z2);
end $$;

-- P(X >= t) for a negative binomial with this mean and size (scipy's
-- nbinom.sf(t - 1, size, size / (size + mean))).
create or replace function public.fpl_nb_upper_tail(p_threshold integer, p_mean double precision, p_size double precision)
returns double precision
language plpgsql immutable strict parallel safe
set search_path = public, pg_temp
as $$
declare
  p double precision;
  q double precision;
  pmf double precision;
  cdf double precision;
  k integer;
begin
  if p_threshold <= 0 then return 1; end if;
  if p_mean <= 0 then return 0; end if;
  p := p_size / (p_size + p_mean);
  q := 1 - p;
  pmf := exp(p_size * ln(p));
  cdf := pmf;
  for k in 0..p_threshold - 2 loop
    pmf := pmf * (k + p_size) / (k + 1) * q;
    cdf := cdf + pmf;
  end loop;
  return greatest(0, least(1, 1 - cdf));
end $$;

-- P(DEFCON) in one fixture, averaged over the minutes distribution (see the
-- header). p_mult = exp(beta x (share - share_bar)). Exit bands are
-- normalised to sum to 1. Goalkeepers and anything else: 0.
create or replace function public.fpl_defcon_probability(p_element_type integer, p_rate90 double precision,
  p_mult double precision, p_start double precision, p_sub double precision,
  p_off_before_60 double precision, p_off_60_84 double precision, p_full double precision)
returns double precision
language plpgsql immutable parallel safe
set search_path = public, pg_temp
as $$
declare
  t integer;
  phi double precision;
  m90 double precision;
  early double precision := 0;
  mid double precision := 0;
  sub double precision := 0;
  full_ double precision;
  eb double precision;
  m integer;
begin
  if p_element_type is null or p_element_type not in (2, 3, 4) or p_rate90 is null then
    return 0;
  end if;
  t := case when p_element_type = 2 then 10 else 12 end;
  phi := case p_element_type when 2 then 13.212545 when 3 then 16.467383 else 9.326230 end;
  m90 := p_rate90 * coalesce(p_mult, 1) / 90;
  foreach m in array array[32, 45, 45, 56, 59] loop early := early + public.fpl_nb_upper_tail(t, m90 * m, phi) / 5; end loop;
  foreach m in array array[62, 68, 73, 78, 82] loop mid := mid + public.fpl_nb_upper_tail(t, m90 * m, phi) / 5; end loop;
  foreach m in array array[2, 9, 16, 24, 37] loop sub := sub + public.fpl_nb_upper_tail(t, m90 * m, phi) / 5; end loop;
  full_ := public.fpl_nb_upper_tail(t, m90 * 90, phi);
  eb := coalesce(p_off_before_60, 0) + coalesce(p_off_60_84, 0) + coalesce(p_full, 0);
  if eb <= 0 then
    return coalesce(p_start, 0) * full_ + coalesce(p_sub, 0) * sub;
  end if;
  return coalesce(p_start, 0) * (coalesce(p_off_before_60, 0) * early + coalesce(p_off_60_84, 0) * mid + coalesce(p_full, 0) * full_) / eb
       + coalesce(p_sub, 0) * sub;
end $$;

-- Count per 90 since 2025/26 shrunk with 3 matches to the position mean
-- (P3: K = 3, no recency decay; mu from the 2025/26 GW1-25 tuning rows).
create or replace function public.fpl_defcon_rate90(p_element_type integer, p_minutes numeric, p_count numeric)
returns numeric
language sql immutable parallel safe
as $$
  select (coalesce(p_count, 0) + 3 * mu) / (coalesce(p_minutes, 0) / 90 + 3)
    from (select case p_element_type when 2 then 7.762450 when 3 then 8.609387 when 4 then 4.615626 end as mu) x
$$;

-- ------------------------------------------------------- per-player history
create table if not exists public.fpl_defcon_player_rates (
  season_id bigint not null,
  fpl_player_id integer not null,
  fpl_code integer,
  appearances integer not null,
  minutes integer not null,
  cbi integer not null,
  tackles integer not null,
  recoveries integer not null,
  share_minutes integer not null,
  share_sum numeric not null,
  updated_at timestamptz not null default now(),
  primary key (season_id, fpl_player_id)
);
comment on table public.fpl_defcon_player_rates is
  'Per current-season FPL player: every Premier League appearance since 2025/26 (2025/26 from fpl_defcon_history_2025_26, this season from fpl_player_gameweeks) -- minutes, CBI, tackles, recoveries, and the minutes / minutes x team market goal share (closing lines) of matches with a price. Rebuilt by refresh_fpl_defcon_rates() at the start of the FPL projections pipeline. Read by fpl_defensive_contribution_projection_leaguewide (Model Lab P3).';
alter table public.fpl_defcon_player_rates enable row level security;
drop policy if exists "fpl_defcon_player_rates public read" on public.fpl_defcon_player_rates;
create policy "fpl_defcon_player_rates public read" on public.fpl_defcon_player_rates for select using (true);
grant select on public.fpl_defcon_player_rates to anon, authenticated;
grant select, insert, update, delete on public.fpl_defcon_player_rates to service_role;

create or replace function public.refresh_fpl_defcon_rates()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_count integer;
begin
  delete from public.fpl_defcon_player_rates where season_id = v_season;
  with lines as (
    select distinct on (l.home_team_id, l.away_team_id) l.home_team_id, l.away_team_id, l.p_home, l.p_draw, l.p_away, l.p_over
      from public.market_closing_lines l
     where l.league_id = 1 and l.season_id = v_season
       and l.p_home is not null and l.p_draw is not null and l.p_away is not null and l.p_over is not null
     order by l.home_team_id, l.away_team_id, l.match_date desc
  ), shares as (
    select ln.home_team_id, ln.away_team_id, x.lambda_home / (x.lambda_home + x.lambda_away) as home_share
      from lines ln
      cross join lateral public.market_goal_lambdas(ln.p_home::double precision, ln.p_draw::double precision,
                                                    ln.p_away::double precision, ln.p_over::double precision) x
  ), fx as (
    select f.fpl_fixture_id, s.home_share
      from public.fpl_fixtures f
      join public.fpl_teams th on th.season_id = f.season_id and th.fpl_team_id = f.fpl_home_team_id
      join public.fpl_teams ta on ta.season_id = f.season_id and ta.fpl_team_id = f.fpl_away_team_id
      join shares s on s.home_team_id = th.canonical_team_id and s.away_team_id = ta.canonical_team_id
     where f.season_id = v_season
  ), g as (
    select g.fpl_player_id, g.minutes,
           coalesce((g.source_payload -> 'stats' ->> 'clearances_blocks_interceptions')::int, 0) as cbi,
           coalesce((g.source_payload -> 'stats' ->> 'tackles')::int, 0) as tackles,
           coalesce((g.source_payload -> 'stats' ->> 'recoveries')::int, 0) as recoveries,
           case when fx.home_share is null then null when g.was_home then fx.home_share else 1 - fx.home_share end as share
      from public.fpl_player_gameweeks g
      left join fx on fx.fpl_fixture_id = g.fpl_fixture_id
     where g.season_id = v_season and g.minutes > 0
  ), cur as (
    select fpl_player_id, count(*)::int as apps, sum(minutes)::int as minutes, sum(cbi)::int as cbi,
           sum(tackles)::int as tackles, sum(recoveries)::int as recoveries,
           coalesce(sum(minutes) filter (where share is not null), 0)::int as share_minutes,
           coalesce(sum(minutes * share) filter (where share is not null), 0) as share_sum
      from g group by fpl_player_id
  )
  insert into public.fpl_defcon_player_rates (season_id, fpl_player_id, fpl_code, appearances, minutes, cbi, tackles,
                                              recoveries, share_minutes, share_sum, updated_at)
  select v_season, p.fpl_player_id, p.fpl_code,
         coalesce(c.apps, 0) + coalesce(h.appearances, 0),
         coalesce(c.minutes, 0) + coalesce(h.minutes, 0),
         coalesce(c.cbi, 0) + coalesce(h.cbi, 0),
         coalesce(c.tackles, 0) + coalesce(h.tackles, 0),
         coalesce(c.recoveries, 0) + coalesce(h.recoveries, 0),
         coalesce(c.share_minutes, 0) + coalesce(h.share_minutes, 0),
         coalesce(c.share_sum, 0) + coalesce(h.share_sum, 0),
         now()
    from public.fpl_players p
    left join cur c on c.fpl_player_id = p.fpl_player_id
    left join public.fpl_defcon_history_2025_26 h on h.fpl_code = p.fpl_code
   where p.season_id = v_season
     and (c.fpl_player_id is not null or h.fpl_code is not null);
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.refresh_fpl_defcon_rates() from public, anon, authenticated;
grant execute on function public.refresh_fpl_defcon_rates() to service_role;

select public.refresh_fpl_defcon_rates();

-- ------------------------------------------------------------------- the view
create or replace view public.fpl_defensive_contribution_projection_leaguewide with (security_invoker = true) as
with b as (
  select a.fixture_id, a.team_id, a.fpl_player_id, a.element_type, a.expected_minutes, a.prob_starting_xi, a.prob_sub_appearance,
         case a.element_type when 2 then -0.331011 when 3 then -0.156964 when 4 then -0.156964 end as beta,
         case when f.market_home_goals is not null and f.market_away_goals is not null
                   and f.market_home_goals + f.market_away_goals > 0
              then case when a.team_id = f.home_team_id then f.market_home_goals else f.market_away_goals end
                   / (f.market_home_goals + f.market_away_goals)
         end as share
    from public.fpl_projection_leaguewide_allocation_v2 a
    join public.fixtures f on f.fixture_id = a.fixture_id
), r as (
  select b.*,
         public.fpl_defcon_rate90(b.element_type, coalesce(pr.minutes, 0),
           coalesce(pr.cbi + pr.tackles + case when b.element_type = 2 then 0 else pr.recoveries end, 0)) as rate90,
         coalesce(pr.share_sum / nullif(pr.share_minutes, 0), 0.5) as share_bar,
         eb.p_off_before_60, eb.p_off_60_84, eb.p_full
    from b
    left join public.fpl_defcon_player_rates pr
      on pr.season_id = (select public.fpl_current_season_id()) and pr.fpl_player_id = b.fpl_player_id
    left join public.fpl_player_exit_bands eb
      on eb.season_id = (select public.fpl_current_season_id()) and eb.fpl_player_id = b.fpl_player_id
)
select r.fixture_id,
       r.team_id,
       r.fpl_player_id,
       r.element_type,
       r.expected_minutes,
       r.prob_starting_xi,
       case when r.element_type in (2, 3, 4) then
         round(public.fpl_defcon_probability(
           r.element_type, r.rate90::double precision,
           exp(r.beta * coalesce(r.share - r.share_bar, 0))::double precision,
           r.prob_starting_xi::double precision, coalesce(r.prob_sub_appearance, 0)::double precision,
           coalesce(r.p_off_before_60, 0)::double precision, coalesce(r.p_off_60_84, 0)::double precision,
           coalesce(r.p_full, 1)::double precision)::numeric, 6)
       else 0::numeric end as defensive_contribution_probability,
       case when r.element_type = 2 then 10 when r.element_type in (3, 4) then 12 else null::integer end as threshold,
       case when r.element_type in (2, 3, 4) then r.rate90 else null::numeric end as shrunk_events90
  from r;

comment on view public.fpl_defensive_contribution_projection_leaguewide is
  'P(earning the DEFCON points) per player and fixture, including the chance he does not play enough: Model Lab P3 negative-binomial count model (switched 30 Oct 2026, migration 20261030190000). threshold = 10 (DEF) / 12 (MID, FWD); shrunk_events90 = the P3 rate per 90 (official count, since 2025/26, shrunk with 3 matches to the position mean).';

-- ---------------------------------------------------------------- change log
insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
select date '2026-10-30', 'prediction',
       'FPL defensive contribution: P3 count model replaces the exponential curve',
       'Model Lab P3_defcon_count passed on the 2026/27 GW1-8 holdout (Brier 0.0895 v 0.0946, log loss 0.2948 v 0.3142; defenders 0.1473 v 0.1575); Chris approved the switch on 30 Oct 2026.',
       'fpl_defensive_contribution_projection_leaguewide now gives P(count >= 10 / 12) under a negative binomial (size 13.2 / 16.5 / 9.3) with the official count (defenders CBIT, others CBIRT), rate since 2025/26 shrunk with 3 matches to 7.762 / 8.609 / 4.616 per 90, a market goal-share term (beta -0.33 DEF, -0.16 MID/FWD, against the player''s own history share; neutral without a price), averaged over start x exit bands and sub appearances. Was: start x base x exp(0.28 (shrunk90 - prior90)) x min(1, xmins/60), defenders CBI only, this season only, cap 0.9. Rates in fpl_defcon_player_rates, rebuilt by refresh_fpl_defcon_rates() each pipeline run.',
       'leaguewide_v6 DEFCON curve', 'leaguewide_v6 DEFCON P3', 'migration 20261030190000'
 where not exists (select 1 from public.model_change_log where reference = 'migration 20261030190000');
