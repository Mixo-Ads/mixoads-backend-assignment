import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const API_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';
const EMAIL = process.env.AD_PLATFORM_EMAIL!;
const PASSWORD = process.env.AD_PLATFORM_PASSWORD!;

let token: string | null = null;
let tokenExpiryTime = 0;

export async function getAccessToken(){
    if(token && Date.now() < tokenExpiryTime - 60_000){
        return token;
    }

    const authString = Buffer.from(`${EMAIL}:${PASSWORD}`).toString('base64');

    const response = await fetch(`${API_URL}/auth/token`,{
        method:'POST',
        headers:{
            Authorization:`Basic ${authString}`
        },
        timeout:5000
    })

    if(!response.ok){
        throw new Error(`Auth failed: ${response.status}`);
    }

    const data: any = await response.json();

    token = data.access_token;
    tokenExpiryTime = Date.now() + data.expires_in * 1000;

    return token;
}