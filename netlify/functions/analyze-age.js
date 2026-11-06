exports.handler=async(event)=>{
 const reply=(statusCode,body)=>({statusCode,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(body)});
 if(event.httpMethod!=="POST")return reply(405,{error:"Method not allowed"});
 try{
  const {path}=JSON.parse(event.body||"{}");if(typeof path!=="string"||!/^\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(path))return reply(400,{error:"Invalid image reference"});
  const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,gemini=process.env.GEMINI_API_KEY,bucket=process.env.SUPABASE_BUCKET||"photo-age-ai";
  if(!base||!key||!gemini)return reply(503,{error:"Age estimation is not configured"});
  const url=`${base.replace(/\/$/,"")}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const img=await fetch(url,{headers:{Authorization:`Bearer ${key}`,apikey:key}});if(!img.ok)return reply(502,{error:"Could not read uploaded image"});
  const bytes=Buffer.from(await img.arrayBuffer());if(bytes.length>8*1024*1024)return reply(400,{error:"Image too large"});
  const ext=path.split(".").pop().toLowerCase(),mime=ext==="jpg"?"image/jpeg":`image/${ext}`;
  const prompt='Estimate the apparent age in years of the main clearly visible person based only on visible appearance. This is an uncertain visual guess, not actual age. If no clear person/face can be assessed, return status unavailable. Do not identify the person or infer other traits. Return JSON only: {"status":"estimated" or "unavailable","estimated_age":integer or null,"range":"approximate range","note":"short uncertainty caveat"}.';
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(gemini)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:mime,data:bytes.toString("base64")}}]}],generationConfig:{temperature:.2,responseMimeType:"application/json"}})});
  const payload=await r.json().catch(()=>({}));if(!r.ok)return reply(502,{error:"AI could not process this image"});
  const output=payload.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();if(!output)return reply(502,{error:"No estimate returned"});
  const result=JSON.parse(output.replace(/^```json\s*|\s*```$/g,""));
  if(result.status!=="estimated"||!Number.isInteger(result.estimated_age)||result.estimated_age<1||result.estimated_age>110)return reply(200,{status:"unavailable"});
  return reply(200,{status:"estimated",estimated_age:result.estimated_age,range:String(result.range||"").slice(0,30),note:"Approximate visual guess only; not verified actual age."});
 }catch(e){console.error(e);return reply(500,{error:"Could not estimate apparent age"})}
};