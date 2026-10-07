/* ===========================================================================
   shared/analytics.js — product events from the games, through the same
   Google Analytics property and rules as the main site (src/lib/analytics.ts):

     - only on fixtureshark.com (never on previews or locally);
     - only after the visitor accepted cookies on the site (the same
       'fds-analytics-consent' choice: the games are on the same domain);
     - never from an admin's device ('fds-analytics-admin-device');
     - no personal data in any event.

   The measurement ID is stamped in at deploy from the game site's
   GA_MEASUREMENT_ID setting (netlify.toml). Until that is set, every call
   here does nothing.
   =========================================================================== */
const BTS_GA_ID="__GA_ID__";
let BTS_GA_READY=false;
function btsAnalyticsOn(){
  try{
    if(!/^G-[A-Z0-9]+$/.test(BTS_GA_ID))return false;
    if(typeof location==="undefined"||location.hostname!=="fixtureshark.com")return false;
    if(localStorage.getItem("fds-analytics-admin-device")==="1")return false;
    return localStorage.getItem("fds-analytics-consent")==="granted";
  }catch(e){return false}
}
function btsLoadGa(){
  if(BTS_GA_READY||!btsAnalyticsOn())return BTS_GA_READY;
  window.dataLayer=window.dataLayer||[];
  window.gtag=function(){window.dataLayer.push(arguments)};
  window.gtag("consent","default",{analytics_storage:"granted",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"});
  const s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+BTS_GA_ID;document.head.appendChild(s);
  window.gtag("js",new Date());window.gtag("config",BTS_GA_ID,{send_page_view:false,allow_google_signals:false});
  BTS_GA_READY=true;return true;
}
/* An event: name and a few numbers or short labels. Never personal data. */
function btsTrack(name,params){try{if(btsLoadGa())window.gtag("event",name,params||{})}catch(e){}}
