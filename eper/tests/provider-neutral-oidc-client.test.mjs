import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { ProviderNeutralOidcClient } from "../dist/packages/identity/provider-neutral-oidc-client.js";

const issuer="https://id.example";
const clientId="eper-client";
const redirectUri="https://eper.example/customer/auth/callback";
const now=new Date("2026-11-01T00:00:00.000Z");
const {publicKey,privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const jwk={...publicKey.export({format:"jwk"}),kid:"key-1",use:"sig",alg:"RS256"};
function jwt(claimOverrides={}) {
  const header=Buffer.from(JSON.stringify({alg:"RS256",kid:"key-1",typ:"JWT"})).toString("base64url");
  const claims=Buffer.from(JSON.stringify({iss:issuer,sub:"subject-001",aud:clientId,exp:Math.floor(now.getTime()/1000)+300,iat:Math.floor(now.getTime()/1000),nonce:"nonce-placeholder",...claimOverrides})).toString("base64url");
  const input=header+"."+claims;
  return input+"."+sign("RSA-SHA256",Buffer.from(input),privateKey).toString("base64url");
}
function storeFake() {
  let transaction=null; let consumed=false;
  return {
    async createLoginTransaction(input){transaction=input;},
    async consumeLoginTransaction(state){
      if(consumed||!transaction||createHash("sha256").update(state).digest("hex")!==transaction.stateHash)return null;
      consumed=true;
      return {nonceHash:transaction.nonceHash,pkceVerifierCiphertext:transaction.pkceVerifierCiphertext,issuer:transaction.issuer,redirectUri:transaction.redirectUri};
    },
    get transaction(){return transaction;}
  };
}
function clientWith(tokenFactory) {
  const fetchImpl=async(input,init)=>{
    const url=String(input);
    if(url===issuer+"/.well-known/openid-configuration") return new Response(JSON.stringify({issuer,authorization_endpoint:issuer+"/authorize",token_endpoint:issuer+"/token",jwks_uri:issuer+"/jwks"}),{status:200});
    if(url===issuer+"/jwks") return new Response(JSON.stringify({keys:[jwk]}),{status:200});
    if(url===issuer+"/token") {
      assert.equal(init.method,"POST");
      const form=new URLSearchParams(init.body);
      assert.equal(form.get("grant_type"),"authorization_code");
      assert.equal(form.get("code_verifier")?.length,43);
      return new Response(JSON.stringify({id_token:tokenFactory()}),{status:200});
    }
    throw new Error("unexpected_oidc_url");
  };
  return new ProviderNeutralOidcClient({issuer,clientId,redirectUri,pkceEncryptionKey:"k".repeat(48),fetchImpl,now:()=>now});
}

test("authorization request uses state, nonce and S256 PKCE with encrypted verifier persistence",async()=>{
  const store=storeFake(); const client=clientWith(()=>jwt());
  const started=await client.beginLogin(store);
  const url=new URL(started.authorizationUrl);
  assert.equal(url.searchParams.get("response_type"),"code");
  assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.ok(url.searchParams.get("nonce"));
  assert.equal(url.searchParams.get("state"),started.state);
  assert.equal(store.transaction.stateHash,createHash("sha256").update(started.state).digest("hex"));
  assert.ok(store.transaction.pkceVerifierCiphertext.startsWith("v1."));
  assert.equal(store.transaction.pkceVerifierCiphertext.split(".").length,4);
});

test("callback exchanges code and validates issuer, audience, signature and nonce",async()=>{
  const store=storeFake(); const client=clientWith(()=>jwt({nonce:store.nonce}));
  const started=await client.beginLogin(store); store.nonce=new URL(started.authorizationUrl).searchParams.get("nonce");
  const result=await client.completeLogin(store,"authorization-code",started.state);
  assert.equal(result.issuer,issuer); assert.equal(result.subject,"subject-001");
  await assert.rejects(()=>client.completeLogin(store,"authorization-code",started.state),{message:"EPER_OIDC_STATE_INVALID_OR_REPLAYED"});
});

test("callback rejects nonce mismatch",async()=>{
  const store=storeFake(); const client=clientWith(()=>jwt({nonce:"wrong-nonce"}));
  const started=await client.beginLogin(store);
  await assert.rejects(()=>client.completeLogin(store,"authorization-code",started.state),{message:"EPER_OIDC_NONCE_INVALID"});
});

test("callback rejects an invalid audience",async()=>{
  const store=storeFake(); const client=clientWith(()=>jwt({aud:"other-client"}));
  const started=await client.beginLogin(store);
  await assert.rejects(()=>client.completeLogin(store,"authorization-code",started.state),{message:"EPER_OIDC_ID_TOKEN_CLAIMS_INVALID"});
});

test("callback rejects a bad signature",async()=>{
  const store=storeFake(); const client=clientWith(()=>{
    const good=jwt({nonce:store.nonce});
    return good.slice(0,-2)+"xx";
  });
  const started=await client.beginLogin(store); store.nonce=new URL(started.authorizationUrl).searchParams.get("nonce");
  await assert.rejects(()=>client.completeLogin(store,"authorization-code",started.state),{message:"EPER_OIDC_SIGNATURE_INVALID"});
});
