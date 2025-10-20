import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const q = z.object({ addr: z.string().regex(/^0x[a-fA-F0-9]{40}$/) });
function cors(){return{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};}

// Etherscan V2 base + Base chain id
const V2 = "https://api.etherscan.io/v2/api";
const CHAIN_ID = 8453; // Base mainnet

type ScanResp = { status?: string; message?: string; result?: any; data?: any };

async function getList(params: URLSearchParams) {
  const url = `${V2}?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j: ScanResp = await res.json().catch(()=>({}));
  // V2 bazen data altında döner, bazen result altında (doküman geriye dönük uyumlu)
  const arr: any[] = Array.isArray((j as any).data) ? (j as any).data : Array.isArray(j.result) ? (j.result as any[]) : [];
  return arr;
}

async function fetchAllTimestamps(addr: string, apiKey?: string) {
  const base = (action: string) => {
    const p = new URLSearchParams();
    p.set("chainid", String(CHAIN_ID));
    p.set("module", "account");
    p.set("action", action);
    p.set("address", addr);
    p.set("startblock", "0");
    p.set("endblock", "99999999");
    p.set("page", "1");
    p.set("offset", "10000");
    p.set("sort", "asc");
    if (apiKey) p.set("apikey", apiKey);
    return p;
  };

  const [normal, internal, token] = await Promise.all([
    getList(base("txlist")),
    getList(base("txlistinternal")),
    getList(base("tokentx")),
  ]);

  const stamps: number[] = [];
  for (const tx of normal)   stamps.push(Number(tx.timeStamp ?? tx.timestamp));
  for (const tx of internal) stamps.push(Number(tx.timeStamp ?? tx.timestamp));
  for (const tx of token)    stamps.push(Number(tx.timeStamp ?? tx.timestamp));
  return stamps.filter(Number.isFinite).sort((a,b)=>a-b);
}

function median(a: number[]) { if (!a.length) return 0; const s=[...a].sort((x,y)=>x-y); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }
function variance(a: number[]) { if (a.length<2) return 0; const mean=a.reduce((p,c)=>p+c,0)/a.length; return a.reduce((p,c)=>p+(c-mean)*(c-mean),0)/a.length; }
function rhythmScore(tempo:number,vari:number,momentum:number){const t=Math.max(0,Math.min(1,3600/(tempo+1)));const v=Math.max(0,Math.min(1,Math.log10(vari+1)/5));const m=Math.max(0,Math.min(1,Math.log10(momentum+0.1)+1));return Math.round(Math.max(0,Math.min(100,100*(0.45*v+0.35*m+0.20*t))));}
function classify(score: number){ if(score>=75) return "Surge Farmer"; if(score>=60) return "Pulse Trader"; if(score>=40) return "Wave Builder"; if(score>=20) return "Chaotic Nomad"; return "Still Flow"; }

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = q.safeParse({ addr: searchParams.get("addr") ?? "" });
    if (!parsed.success) return NextResponse.json({ error: "Invalid address" }, { status: 400, headers: cors() });

    // Hem BASESCAN_API_KEY hem ETHERSCAN_API_KEY isimlerini destekle
    const apiKey = process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY || undefined;

    const addr = parsed.data.addr;
    const stamps = await fetchAllTimestamps(addr, apiKey);

    // Son 90 gün
    const now = Math.floor(Date.now()/1000);
    const recent = stamps.filter(t => t >= now - 90*24*3600);

    if (recent.length < 3) {
      return NextResponse.json({ address: addr, score: 0, type: "Still Flow", metrics: { txCount: recent.length, tempo: 0, variance: 0, momentum: 0 } }, { headers: cors() });
    }

    const deltas:number[]=[]; for(let i=1;i<recent.length;i++) deltas.push(recent[i]-recent[i-1]);
    const tempo = median(deltas);
    const vari  = variance(deltas);

    const d7 = now - 7*24*3600, d14 = now - 14*24*3600;
    const last7 = recent.filter(t => t >= d7).length;
    const prev7 = recent.filter(t => t >= d14 && t < d7).length;
    const momentum = prev7 === 0 ? (last7 > 0 ? 2 : 0) : (last7/prev7);

    const score = rhythmScore(tempo, vari, momentum);
    const type  = classify(score);

    return NextResponse.json({
      address: addr,
      score, type,
      metrics: {
        txCount: recent.length,
        tempo: Math.round(tempo),
        variance: Math.round(vari),
        momentum: Number(momentum.toFixed(2))
      }
    }, { headers: cors() });

  } catch (e:any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 502, headers: cors() });
  }
}

export async function OPTIONS(){ return NextResponse.json({}, { headers: cors() }); }
