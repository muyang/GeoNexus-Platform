package com.geonexus.mgbackend.identity.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

/** 菜单与按钮权限（RuoYi sys_menu）。permissions 来自 perms 字段（如 system:user:list）。 */
@TableName("sys_menu")
public class SysMenu {
    @TableId("menu_id")
    private Long menuId;
    private String menuName;
    private Long parentId;
    private Integer orderNum;
    private String path;
    private String component;
    private String menuType;
    private String visible;
    private String status;
    private String perms;
    private String icon;

    public Long getMenuId() { return menuId; }
    public void setMenuId(Long menuId) { this.menuId = menuId; }
    public String getMenuName() { return menuName; }
    public void setMenuName(String menuName) { this.menuName = menuName; }
    public Long getParentId() { return parentId; }
    public void setParentId(Long parentId) { this.parentId = parentId; }
    public Integer getOrderNum() { return orderNum; }
    public void setOrderNum(Integer orderNum) { this.orderNum = orderNum; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public String getComponent() { return component; }
    public void setComponent(String component) { this.component = component; }
    public String getMenuType() { return menuType; }
    public void setMenuType(String menuType) { this.menuType = menuType; }
    public String getVisible() { return visible; }
    public void setVisible(String visible) { this.visible = visible; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getPerms() { return perms; }
    public void setPerms(String perms) { this.perms = perms; }
    public String getIcon() { return icon; }
    public void setIcon(String icon) { this.icon = icon; }
}
