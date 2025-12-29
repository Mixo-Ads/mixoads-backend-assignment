export interface Campaign {
  id: string;
  name: string;
  status: string;
  budget: number;
  impressions: number;
  clicks: number;
  conversions: number;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  expires_in: number;
}

export interface CampaignsResponse {
  data: Campaign[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
}
