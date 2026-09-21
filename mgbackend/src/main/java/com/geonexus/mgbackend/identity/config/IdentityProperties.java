package com.geonexus.mgbackend.identity.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 身份配置（geonexus.identity.*）。 */
@ConfigurationProperties(prefix = "geonexus.identity")
public class IdentityProperties {

    /** JWT 签发者，校验时强校验。 */
    private String issuer = "geonexus-platform";
    /** access 有效期（分钟）：目标契约 30 分钟。 */
    private long accessMinutes = 30;
    /** refresh 有效期（天）。 */
    private long refreshDays = 7;
    /** 连续登录失败次数上限，超过则锁定。 */
    private int maxLoginFailures = 5;
    /** 锁定时长（分钟）。 */
    private long lockMinutes = 10;
    /** 引导管理员账号（ADMIN_EMAILS 的 Java 版：初始化种子用）。 */
    private String adminUserName = "admin";
    private String adminPassword = "Admin@GeoNexus2026";
    /** 公众自助注册落在哪个部门（部门名）。 */
    private String publicDeptName = "公众用户";
    /** 是否初始化演示账号（生产环境应设为 false 并改掉所有口令）。 */
    private boolean demoAccounts = true;
    /** 演示账号的统一口令（admin 除外）。 */
    private String demoPassword = "Demo@GeoNexus2026";

    public String getIssuer() { return issuer; }
    public void setIssuer(String issuer) { this.issuer = issuer; }
    public long getAccessMinutes() { return accessMinutes; }
    public void setAccessMinutes(long accessMinutes) { this.accessMinutes = accessMinutes; }
    public long getRefreshDays() { return refreshDays; }
    public void setRefreshDays(long refreshDays) { this.refreshDays = refreshDays; }
    public int getMaxLoginFailures() { return maxLoginFailures; }
    public void setMaxLoginFailures(int maxLoginFailures) { this.maxLoginFailures = maxLoginFailures; }
    public long getLockMinutes() { return lockMinutes; }
    public void setLockMinutes(long lockMinutes) { this.lockMinutes = lockMinutes; }
    public String getAdminUserName() { return adminUserName; }
    public void setAdminUserName(String adminUserName) { this.adminUserName = adminUserName; }
    public String getAdminPassword() { return adminPassword; }
    public void setAdminPassword(String adminPassword) { this.adminPassword = adminPassword; }
    public String getPublicDeptName() { return publicDeptName; }
    public void setPublicDeptName(String publicDeptName) { this.publicDeptName = publicDeptName; }
    public boolean isDemoAccounts() { return demoAccounts; }
    public void setDemoAccounts(boolean demoAccounts) { this.demoAccounts = demoAccounts; }
    public String getDemoPassword() { return demoPassword; }
    public void setDemoPassword(String demoPassword) { this.demoPassword = demoPassword; }
}
