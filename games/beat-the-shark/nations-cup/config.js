/* ===========================================================================
   nations-cup/config.js — every number that decides how the Nations Cup plays.

   Change these to rebalance, then run
     node games/beat-the-shark/nations-cup/test/checks.cjs
   =========================================================================== */

/* THE EVENT (Chris, 6 Oct 2026): a mixed national team event across the
   surfaces, in place of the Davis Cup idea. Sixteen nations, knockout.
   Each round on its own surface, so the squad is planned across them. */
const ROUNDS=[
  {name:"First round",short:"R1",surface:"hard"},
  {name:"Quarter-final",short:"QF",surface:"clay"},
  {name:"Semi-final",short:"SF",surface:"grass"},
  {name:"Final",short:"F",surface:"indoor"}];
const SURF_NAME={hard:"Hard",clay:"Clay",grass:"Grass",indoor:"Indoor hard"};

/* A TIE: five rubbers, best of three sets, first nation to three. Each tie
   uses two men and two women and each plays two rubbers, so the man in
   the singles also plays the men's doubles, and his partner plays the
   mixed. Your squad has three of each, so one man and one woman can rest. */
const EVENTS=["MS","WS","MD","WD","XD"];
const EVENT_NAME={MS:"Men's singles",WS:"Women's singles",MD:"Men's doubles",WD:"Women's doubles",XD:"Mixed doubles"};
const SQUAD={m:3,w:3};

/* THE MATCH MODEL, point of contact with FixtureShark's tennis Elo. Each
   game is held at a rate that moves with the rating gap; set and match
   follow from the games (tie-break at 6–6). Base hold rates are the tours'
   typical ones; the slopes are fitted so that a best-of-three match goes
   as Elo says it should (100 points: 64%, 200: 76%, 300: 85%). */
const HOLD={MS:{b:.80,s:.045},WS:{b:.64,s:.06},MD:{b:.82,s:.043},WD:{b:.70,s:.052},XD:{b:.74,s:.05}};
const TIEBREAK_K=.6;

/* How the players' own numbers move a rubber (Elo points). */
const FATIGUE_ELO=2;      // per point of condition below 100
const MORALE_ELO=5;       // per point of team morale (−5 to +5)
const KNOCK_ELO=45;       // playing with a knock
const PRACTICE_ELO=20;    // a week on the next tie's surface
const INDOOR={serve:25,all:5,base:-10}; // indoors, by style
/* Doubles: the pair's level is the mean of each player's singles level on
   the surface plus his or her doubles skill, then the partnership. */
const COMPAT={lr:25,net:20,baseBase:-35,history:35};
const STYLE_NAME={base:"Baseliner",all:"All-court",serve:"Serve and volley"};

/* Condition: each set played costs this much; a week between ties gives
   back REST, and a tie on the bench BENCH more. */
const COND={setSingles:7,setDoubles:4.5,rest:16,bench:10,floor:35};
/* Per rubber played: an injury (out of the next tie), or a knock. */
const INCIDENTS={injury:.025,knock:.05};

/* A team event is closer than the tours: each nation's strength is drawn
   this far towards the field's average (1 = the real gaps), keeping the
   real order. Tuned so the top seed wins about two times in five. */
const STRENGTH_SCALE=.7;

/* YOUR POOL: twelve invented players around your nation's real strength
   on each surface. POOL_SHIFT moves the whole pool against the real
   nations (balance). */
const POOL_SHIFT=0;

/* MONEY (GBP m), as in the other games: not scored, but managed. Before each
   tie: travel and every squad player's appearance fee, and one chance card.
   After it: prize money; playing out dead rubbers brings in the gate. In the
   red after a tie, the federation sends a player home (you choose); below
   sackedBelow you are sacked. */
const MONEY={start:1,travel:.4,prize:{w:1,l:.4},title:1,gate:.12,sackedBelow:-2.5};
const BILL_CARDS=[
  {t:"Excess baggage on the rackets",v:-.05},{t:"A racket sponsor's bonus",v:.1},
  {t:"The stringer's overtime",v:-.06},{t:"Ticket sales above forecast",v:.12},
  {t:"A missed connection: one more hotel night",v:-.1},{t:"A broadcaster's fee for the practice sessions",v:.08},
  {t:"Physio tape and ice for the week",v:-.04},{t:"Fan zone merchandise",v:.06}];

/* LEVELS: how much of the game you meet at once, not how hard it is (the
   nation you pick decides that). unlock = ties played before a lever appears. */
const LEVELS={
  beginner:{name:"Beginner",unlock:{lineup:0,afterSingles:1,deadRubber:2,setBreak:3}},
  intermediate:{name:"Intermediate",unlock:{lineup:0,afterSingles:0,deadRubber:0,setBreak:0}}
};
const FIELD=16;
const SHARK_RUNS_DEFAULT=500;

/* Ratings on screen: 1–99, from Elo (1750 = 50, 9 Elo a point). */
function disp(elo){return clamp(Math.round(50+(elo-1750)/9),1,99)}

const SITE="https://fixtureshark.com";
