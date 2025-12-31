-- Campaign Sync Database Schema
-- PostgreSQL 12+

-- Drop existing table if exists
DROP TABLE IF EXISTS campaigns CASCADE;

-- Create campaigns table
CREATE TABLE campaigns (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    status VARCHAR(50) NOT NULL,
    budget DECIMAL(15, 2) NOT NULL,
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    conversions INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT campaigns_status_check CHECK (status IN ('active', 'paused', 'completed')),
    CONSTRAINT campaigns_budget_check CHECK (budget >= 0),
    CONSTRAINT campaigns_impressions_check CHECK (impressions >= 0),
    CONSTRAINT campaigns_clicks_check CHECK (clicks >= 0),
    CONSTRAINT campaigns_conversions_check CHECK (conversions >= 0)
);

-- Create indexes for performance
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_synced_at ON campaigns(synced_at DESC);
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at DESC);
CREATE INDEX idx_campaigns_name ON campaigns(name);

-- Add comments
COMMENT ON TABLE campaigns IS 'Advertising campaign data synced from external API';
COMMENT ON COLUMN campaigns.id IS 'Unique campaign identifier';
COMMENT ON COLUMN campaigns.name IS 'Campaign name';
COMMENT ON COLUMN campaigns.status IS 'Campaign status: active, paused, or completed';
COMMENT ON COLUMN campaigns.budget IS 'Campaign budget in dollars';
COMMENT ON COLUMN campaigns.impressions IS 'Total ad impressions';
COMMENT ON COLUMN campaigns.clicks IS 'Total ad clicks';
COMMENT ON COLUMN campaigns.conversions IS 'Total conversions';
COMMENT ON COLUMN campaigns.created_at IS 'Campaign creation timestamp';
COMMENT ON COLUMN campaigns.synced_at IS 'Last synchronization timestamp';