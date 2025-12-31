import fetch,{RequestInit} from 'node-fetch';
import { getAccessToken } from './auth';
import dotenv from 'dotenv';
dotenv.config();

const API_URL = process.env.AD_PLATFORM_API_URL || 'http://localhost:3001';
const MAX_RETRIES = 5;
const BASE_DELAY = 1000;

function sleep(ms: number){
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function apiRequest<T>(
    path: string,
    options: RequestInit = {},
    attempt = 1
): Promise<T>{
    const token = await getAccessToken();

    try {
        const response = await fetch(`${API_URL}${path}`,{
            ...options,
            headers:{
                ...(options.headers || {}),
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Client-ID':'sync-job'
            },
            timeout: 5000
        })

        if(response.status === 429){
            const retryAfter = Number(response.headers.get('retry-after') || 60);
            console.log(`Rate limited. Retrying after ${retryAfter}s`);
            await sleep(retryAfter * 1000);
            return apiRequest(path,options,attempt);
        }

        if([500,502,503,504].includes(response.status)){
            if(attempt <= MAX_RETRIES){
                const delay = BASE_DELAY * Math.pow(2, attempt);
                console.log(`Retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
                await sleep(delay);
                return apiRequest(path, options, attempt + 1);
            }
        }

        if(!response.ok){
            throw new Error(`API error ${response.status}`);
        }

        return response.json() as Promise<T>;
    } catch (error) {
        if (attempt <= MAX_RETRIES) {
            const delay = BASE_DELAY * Math.pow(2, attempt);
            console.log(`Network error. Retry ${attempt}/${MAX_RETRIES}`);
            await sleep(delay);
            return apiRequest<T>(path, options, attempt + 1);
        }

        throw error;
    }
}