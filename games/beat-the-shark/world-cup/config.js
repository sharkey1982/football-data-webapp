/* ===========================================================================
   world-cup/config.js — every number that decides how the World Cup plays.

   Change these to rebalance, then run
     node games/beat-the-shark/world-cup/test/checks.cjs
   =========================================================================== */

/* FIVE-A-SIDE (Chris, 6 Oct 2026): a keeper and four outfield players,
   two halves of 20 minutes, rolling substitutes, a squad of 7 from 10.
   Goals come from FixtureShark's international model IP1 (data.js) on
   the Elo gap, scaled up because five-a-side produces more goals. */
const FIVE_A_SIDE_GOALS=1.6;
/* Five-a-side is more of a lottery than the full game: the Elo gap counts
   for this share of what IP1 gives it over 90 minutes. Tuned so the
   favourite wins the tournament about two times in five, not four in five. */
const ELO_SCALE=.55;

/* Elo <-> rating. A rating of 50 is an Elo of 1850, and each rating point
   is 12 Elo points, so Spain (2327) rate about 90 and a 1750 side 42. */
const ELO_MID=1850,ELO_PER_POINT=12;

/* THE SHAPES. Slots behind the keeper, and how much each kind of slot
   counts towards attack and defence. A shape is only as good as the
   players in its slots: an attacker in a forward slot is worth his full
   rating; anyone else there is worth much less (OUT_OF_POSITION). */
const SHAPES={
  balanced:{name:"Balanced",code:"1-2-1",slots:["DF","MF","MF","FW"],d:"Steady"},
  attack:{name:"All out attack",code:"1-1-2",slots:["DF","MF","FW","FW"],d:"Two up front"},
  defend:{name:"Shut up shop",code:"2-1-1",slots:["DF","DF","MF","FW"],d:"Protect a lead"}
};
const ATT_W={GK:0,DF:.2,MF:.5,FW:1};
const DEF_W={GK:1.2,DF:1,MF:.5,FW:.1};
/* Normalisers: the balanced shape's totals, so a balanced team of 50s rates 50. */
const ATT_NORM=2.2,DEF_NORM=3.3;
/* Rating lost playing out of position: in a second position, elsewhere
   outfield, a keeper outfield, an outfielder in goal. */
const OUT_OF_POSITION={second:5,other:14,keeperOut:24,inGoal:30};

/* Condition: a full match costs this much (extra time more; a keeper 40%
   of it), a game on the bench restores this much. A player plays at (0.7 + 0.3 x condition). */
const CONDITION={match:24,extra:8,rest:20,floor:30};

/* Incidents per match. A yellow card for each starter at this rate (plus
   his discipline); two yellows and he misses the next match; yellows are
   wiped after the group stage. An injury (out 1-2 matches) to one starter,
   and a knock (questionable for the next) to another. */
const INCIDENTS={yellow:.07,disciplineYellow:.12,red:.01,injury:.12,knock:.2};

/* MONEY (GBP m), as in the football and NFL games: not scored, but it has to
   be managed. Before every match the camp costs go out with one chance
   card; after it the prize money comes in, plus a bonus for each round
   reached. In the red after a match, the FA sends a player home to cut
   costs (you choose who). Deep in the red, you are sacked. */
const MONEY={start:6,camp:2.8,prize:{w:2.4,d:1.3,l:.7},round:1.5,sackedBelow:-8,sendHomeSaving:1.5};
const BILL_CARDS=[
  {t:"The team bus broke down on the way to training",v:-.4},{t:"A kit sponsor's appearance fee",v:.5},
  {t:"Extra security at the hotel",v:-.6},{t:"Ticket allocation sold out",v:.6},
  {t:"Fine for a late arrival at the stadium",v:-.3},{t:"A broadcaster's documentary fee",v:.4},
  {t:"Recovery pool hire for the week",v:-.5},{t:"Fan zone merchandise sales",v:.3}];

/* Hosts of the World Cup get IP1's home advantage in every match. */
const HOSTS=["United States","Mexico","Canada"];

/* LEVELS: how much of the game you meet at once, not how hard it is.
   Beginner: eight nations, two groups of four, semi-finals and a final
   (five matches). Standard: 48 nations, twelve groups, a round of 32
   (eight matches). unlock = matches played before a lever appears. */
const LEVELS={
  beginner:{name:"Beginner",field:8,unlock:{shape:0,half:1,rotation:2,shootout:3}},
  intermediate:{name:"Intermediate",field:48,unlock:{shape:0,half:0,rotation:0,shootout:0}},
  guru:{name:"Advanced",field:48,unlock:{shape:0,half:0,rotation:0,shootout:0},guru:true}
};

/* Your nation: drawn from these Elo ranks (pot 3: good, not a favourite). */
const MY_RANKS=[18,30];
/* A golden generation: your ten are this many rating points better than
   your nation's Elo alone suggests, so a well-run campaign can win it
   (about one in ten), as a well-run club can win the football league. */
const GOLDEN=9;
/* How steeply Your Team's results respond to its own ratings (shape fit,
   out of position, tired legs, the squad you picked): Elo points per
   rating point. Steeper than the Elo scale above, as the football game's
   CLUB_SENS, so the decisions are what move the results. */
const MY_ELO_PER_POINT=24;

/* The Shark's prediction uses the best sensible squad from the whole pool. */
const SHARK_RUNS_DEFAULT=600;

const SITE="https://fixtureshark.com";
