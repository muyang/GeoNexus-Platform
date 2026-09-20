package com.geonexus.mgbackend;

import org.apache.ibatis.annotations.Mapper;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * GeoNexus 管理后台（Java 控制面）。
 *
 * <p>基于 Spring Boot 3 + MyBatis-Plus + H2 的 RuoYi 风格管理后台。
 * 负责 GeoCard 资产 CRUD、GeoNode 节点管理、OGE 凭证配置、
 * 审计追溯，通过 GeoMCP JSON-RPC 调用 Python 执行面。</p>
 *
 * <pre>
 * 启动：mvn spring-boot:run
 * H2 控制台：http://localhost:8080/h2-console
 * API 文档：http://localhost:8080/doc.html（若集成 Knife4j）
 * </pre>
 */
@SpringBootApplication
// 按注解扫描全部子包的 Mapper：新增 identity.mapper 时不必再改这一行
@MapperScan(basePackages = "com.geonexus.mgbackend", annotationClass = Mapper.class)
public class GeoNexusMgApplication {

    public static void main(String[] args) {
        SpringApplication.run(GeoNexusMgApplication.class, args);
    }
}