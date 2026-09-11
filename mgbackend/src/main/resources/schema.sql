-- GeoNexus mgbackend 初始化 DDL
-- H2 兼容语法（同时兼容 PostgreSQL）

CREATE TABLE IF NOT EXISTS mogan_geocard (
    id              VARCHAR(64) PRIMARY KEY,
    capability_id   VARCHAR(128),
    asset_type      VARCHAR(32),
    title           VARCHAR(256) NOT NULL,
    provider        VARCHAR(128),
    node_id         VARCHAR(64),
    region          VARCHAR(64),
    geometry_type   VARCHAR(32),
    temporal_coverage VARCHAR(128),
    access_url      VARCHAR(512),
    license         VARCHAR(64),
    policy_id       VARCHAR(64),
    raw_data_export BOOLEAN DEFAULT FALSE,
    derived_outputs TEXT,
    tags            TEXT,
    description     TEXT,
    status          VARCHAR(16) DEFAULT 'draft',
    del_flag        CHAR(1) DEFAULT '0',
    crs             VARCHAR(32),
    bbox            TEXT,
    bands           TEXT,
    resolution      DOUBLE,
    create_by       VARCHAR(64),
    create_time     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_by       VARCHAR(64),
    update_time     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OGE 凭证配置表（加密存储）
CREATE TABLE IF NOT EXISTS mogan_oge_credential (
    credential_id  VARCHAR(64) PRIMARY KEY,
    node_id        VARCHAR(64),
    endpoint       VARCHAR(256) NOT NULL,
    username       VARCHAR(64) NOT NULL,
    password       VARCHAR(128) NOT NULL,
    client_id      VARCHAR(64),
    client_secret  VARCHAR(128),
    app_name       VARCHAR(128),
    status         VARCHAR(16) DEFAULT 'active',
    last_sync_at   TIMESTAMP,
    last_error     VARCHAR(500),
    del_flag       CHAR(1) DEFAULT '0',
    create_by      VARCHAR(64),
    create_time    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_by      VARCHAR(64),
    update_time    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 审计日志表
CREATE TABLE IF NOT EXISTS mogan_audit (
    id            VARCHAR(64) PRIMARY KEY,
    request_id    VARCHAR(64),
    action        VARCHAR(32) NOT NULL,
    resource_type VARCHAR(32),
    resource_id   VARCHAR(128),
    operator      VARCHAR(64),
    result        VARCHAR(16),
    detail        TEXT,
    create_time   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 种子数据
-- ============================================================

INSERT INTO mogan_geocard (id, capability_id, asset_type, title, provider, node_id, region,
    geometry_type, temporal_coverage, access_url, license, policy_id, description, status)
VALUES
('seed-001', 'data.sentinel-water-extent', 'data', 'Sentinel-2 Water Extent STAC Feed',
 'Open EO Mirror', 'node.mekong', 'Southeast Asia',
 'stac-collection', 'rolling_14_days',
 'http://localhost:8100/stac', 'CC-BY-4.0',
 'policy.data-sovereignty-asean',
 'STAC-described water extent feed for flood response workflows.', 'approved'),

('seed-002', 'data.amazon-ndvi-2015', 'data', 'Amazon Basin NDVI 2015',
 'GeoNexus Data Lab', 'node.amazon', 'South America',
 'raster', '2015-01-01/2015-12-31',
 'http://localhost:8787/data/amazon_ndvi_2015.tif', 'CC-BY-4.0',
 'policy.data-sovereignty-global',
 'NDVI composite for the Amazon basin, 2015.', 'approved'),

('seed-003', 'data.amazon-ndvi-2025', 'data', 'Amazon Basin NDVI 2025',
 'GeoNexus Data Lab', 'node.amazon', 'South America',
 'raster', '2025-01-01/2025-12-31',
 'http://localhost:8787/data/amazon_ndvi_2025.tif', 'CC-BY-4.0',
 'policy.data-sovereignty-global',
 'NDVI composite for the Amazon basin, 2025.', 'approved');