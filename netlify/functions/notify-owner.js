exports.handler=async(event)=>{
 const reply=(statusCode,body)=>({statusCode,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(body)});
 if(event.httpMethod!=="POST")return reply(405,{error:"Method not allowed"});
 try{
  const {uploads,analyses=[],consent}=JSON.parse(event.body||"{}");
  if(consent!==true||!Array.isArray(uploads)||uploads.length<1||uploads.length>8)return reply(400,{error:"Consent and 1–8 uploaded images required"});
  const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,bucket=process.env.SUPABASE_BUCKET||"photo-age-ai",resend=process.env.RESEND_API_KEY,owner=process.env.OWNER_EMAIL||"mkkalai95@gmail.com";
  if(!base||!key||!resend)return reply(500,{error:"Storage or email service not configured"});
  const links=[];
  for(const item of uploads){
   if(!item||typeof item.path!=="string"||!/^\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(item.path))return reply(400,{error:"Invalid uploaded image"});
   const url=`${base.replace(/\/$/,"")}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${item.path.split("/").map(encodeURIComponent).join("/")}`;
   const r=await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${key}`,apikey:key,"Content-Type":"application/json"},body:JSON.stringify({expiresIn:604800})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error("Could not create private download link");
   const signed=d.signedURL||d.signedUrl;if(!signed)throw Error("No signed link returned");
   links.push({name:String(item.name||"Photo").replace(/[<>]/g,"").slice(0,120),url:signed.startsWith("http")?signed:`${base.replace(/\/$/,"")}/storage/v1${signed.startsWith("/")?"":"/"}${signed}`});
  }
  const map=new Map(analyses.filter(a=>a&&typeof a.name==="string").map(a=>[a.name,a]));
  const list=links.map(x=>{const a=map.get(x.name),age=a&&a.status==="estimated"?` — estimated apparent age: ${Number(a.estimated_age)} (${String(a.range||"").replace(/[<>]/g,"")})`:" — estimate unavailable";return `<li><a href="${x.url}">${x.name.replace(/&/g,"&amp;")}</a>${age}</li>`}).join("");
  const mail=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${resend}`,"Content-Type":"application/json"},body:JSON.stringify({from:process.env.EMAIL_FROM||"Photo Age AI <onboarding@resend.dev>",to:[owner],subject:`Photo Age AI: ${links.length} new photo(s)`,html:`<h2>New Photo Age AI upload</h2><p>${links.length} photo(s) submitted with user consent.</p><ul>${list}</ul><p>Age estimates are uncertain visual guesses. Private links expire in 7 days.</p>`})});
  if(!mail.ok)return reply(502,{error:"Photo upload succeeded, but email notification failed"});return reply(200,{ok:true});
 }catch(e){console.error(e);return reply(500,{error:"Could not send notification"})}
};