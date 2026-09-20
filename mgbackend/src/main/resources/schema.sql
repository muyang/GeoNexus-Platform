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
-- 注意：spring.sql.init.mode=always 意味着每次启动都会执行本文件，
-- 所以种子必须是幂等的 —— 先删掉固定 id 再插入（H2 与 PostgreSQL 都支持）。
-- ============================================================
DELETE FROM mogan_geocard WHERE id IN ('sentinel-2-amazon', 'srtm-dem-30m', 'ndvi-change-detection');

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
-- ============================================================
-- 身份与权限（RuoYi 模型：sys_* 表）
-- 权威在这里：账号、组织、角色、菜单权限、数据范围。
-- ============================================================
CREATE TABLE IF NOT EXISTS sys_dept (
  dept_id     BIGINT PRIMARY KEY,
  parent_id   BIGINT DEFAULT 0,
  ancestors   VARCHAR(512) DEFAULT '',
  dept_name   VARCHAR(64)  NOT NULL,
  order_num   INT DEFAULT 0,
  leader      VARCHAR(32),
  phone       VARCHAR(20),
  email       VARCHAR(64),
  status      CHAR(1) DEFAULT '0',
  del_flag    CHAR(1) DEFAULT '0',
  create_time TIMESTAMP,
  update_time TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_user (
  user_id         BIGINT PRIMARY KEY,
  dept_id         BIGINT,
  user_name       VARCHAR(64)  NOT NULL,
  nick_name       VARCHAR(64),
  user_type       VARCHAR(8)   DEFAULT 'public',   -- public | staff | service
  email           VARCHAR(96),
  phonenumber     VARCHAR(20),
  sex             CHAR(1)      DEFAULT '2',
  avatar          VARCHAR(256),
  password        VARCHAR(128) NOT NULL,
  status          CHAR(1)      DEFAULT '0',        -- 0 正常 1 停用
  del_flag        CHAR(1)      DEFAULT '0',
  tenant_id       VARCHAR(64),
  login_ip        VARCHAR(64),
  login_date      TIMESTAMP,
  pwd_update_date TIMESTAMP,
  create_time     TIMESTAMP,
  update_time     TIMESTAMP,
  remark          VARCHAR(256)
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_sys_user_name ON sys_user(user_name);
CREATE UNIQUE INDEX IF NOT EXISTS uk_sys_user_email ON sys_user(email);

CREATE TABLE IF NOT EXISTS sys_role (
  role_id     BIGINT PRIMARY KEY,
  role_name   VARCHAR(64) NOT NULL,
  role_key    VARCHAR(64) NOT NULL,
  role_sort   INT DEFAULT 0,
  data_scope  CHAR(1) DEFAULT '5',                 -- 1 全部 2 自定义 3 本部门 4 本部门及以下 5 仅本人
  status      CHAR(1) DEFAULT '0',
  del_flag    CHAR(1) DEFAULT '0',
  create_time TIMESTAMP,
  update_time TIMESTAMP,
  remark      VARCHAR(256)
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_sys_role_key ON sys_role(role_key);

CREATE TABLE IF NOT EXISTS sys_menu (
  menu_id     BIGINT PRIMARY KEY,
  menu_name   VARCHAR(64) NOT NULL,
  parent_id   BIGINT DEFAULT 0,
  order_num   INT DEFAULT 0,
  path        VARCHAR(200),
  component   VARCHAR(255),
  menu_type   CHAR(1) DEFAULT 'C',                 -- M 目录 C 菜单 F 按钮
  visible     CHAR(1) DEFAULT '0',
  status      CHAR(1) DEFAULT '0',
  perms       VARCHAR(100),
  icon        VARCHAR(100),
  create_time TIMESTAMP,
  update_time TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_user_role (
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sys_role_menu (
  role_id BIGINT NOT NULL,
  menu_id BIGINT NOT NULL,
  PRIMARY KEY (role_id, menu_id)
);

CREATE TABLE IF NOT EXISTS sys_role_dept (
  role_id BIGINT NOT NULL,
  dept_id BIGINT NOT NULL,
  PRIMARY KEY (role_id, dept_id)
);

CREATE TABLE IF NOT EXISTS sys_logininfor (
  info_id     BIGINT PRIMARY KEY,
  user_name   VARCHAR(64),
  ipaddr      VARCHAR(64),
  browser     VARCHAR(64),
  os          VARCHAR(64),
  status      CHAR(1) DEFAULT '0',                 -- 0 成功 1 失败
  msg         VARCHAR(255),
  login_time  TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_oper_log (
  oper_id     BIGINT PRIMARY KEY,
  title       VARCHAR(64),
  business_type VARCHAR(16),
  method      VARCHAR(255),
  request_method VARCHAR(8),
  oper_name   VARCHAR(64),
  oper_url    VARCHAR(255),
  oper_ip     VARCHAR(64),
  status      CHAR(1) DEFAULT '0',
  error_msg   VARCHAR(512),
  oper_time   TIMESTAMP
);
