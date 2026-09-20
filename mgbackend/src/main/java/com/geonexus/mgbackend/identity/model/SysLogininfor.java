package com.geonexus.mgbackend.identity.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;

/** 登录日志（RuoYi sys_logininfor）：谁、何时、何 IP、成功或失败原因。 */
@TableName("sys_logininfor")
public class SysLogininfor {
    @TableId("info_id")
    private Long infoId;
    private String userName;
    private String ipaddr;
    private String browser;
    private String os;
    private String status;
    private String msg;
    private LocalDateTime loginTime;

    public Long getInfoId() { return infoId; }
    public void setInfoId(Long infoId) { this.infoId = infoId; }
    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }
    public String getIpaddr() { return ipaddr; }
    public void setIpaddr(String ipaddr) { this.ipaddr = ipaddr; }
    public String getBrowser() { return browser; }
    public void setBrowser(String browser) { this.browser = browser; }
    public String getOs() { return os; }
    public void setOs(String os) { this.os = os; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getMsg() { return msg; }
    public void setMsg(String msg) { this.msg = msg; }
    public LocalDateTime getLoginTime() { return loginTime; }
    public void setLoginTime(LocalDateTime loginTime) { this.loginTime = loginTime; }
}
