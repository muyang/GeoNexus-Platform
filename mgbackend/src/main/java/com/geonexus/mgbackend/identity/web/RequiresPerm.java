package com.geonexus.mgbackend.identity.web;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** 声明进入该方法所需的细粒度权限（对应 sys_menu.perms）。由 IdentityInterceptor 统一判定。 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequiresPerm {
    String value();
}
