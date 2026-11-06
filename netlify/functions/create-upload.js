const crypto=require("crypto");
exports.handler=async(event)=>{
 const reply=(statusCode,body)=>({statusCode,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(body)});
 if(event.httpMethod!=="POST")return reply(405,{error:"Method not allowed"});
 try{
  const {contentType,size}=JSON.parse(event.body||"{}");
  if(!["image/jpeg","image/png","image/webp"].includes(contentType))return reply(400,{error:"Unsupported image type"});
  if(!Number.isInteger(size)||size<1||size>8*1024*1024)return reply(400,{error:"Image must be 8 MB or smaller"});
  const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,bucket=process.env.SUPABASE_BUCKET||"photo-age-ai";
  if(!base||!key)return reply(500,{error:"Storage is not configured"});
  const ext=contentType==="image/jpeg"?"jpg":contentType.split("/")[1],path=`${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${ext}`;
  const url=`${base.replace(/\/$/,"")}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const r=await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${key}`,apikey:key,"Content-Type":"application/json"},body:JSON.stringify({upsert:false})});
  const data=await r.json().catch(()=>({}));if(!r.ok)return reply(502,{error:"Could not create upload link"});
  const signed=data.url||data.signedURL||data.signedUrl;if(!signed)return reply(502,{error:"No upload URL returned"});
  return reply(200,{signedUrl:signed.startsWith("http")?signed:`${base.replace(/\/$/,"")}/storage/v1${signed.startsWith("/")?"":"/"}${signed}`,path});
 }catch(e){return reply(400,{error:"Invalid upload request"})}
};