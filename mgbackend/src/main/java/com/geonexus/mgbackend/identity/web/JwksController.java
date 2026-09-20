package com.geonexus.mgbackend.identity.web;

import com.geonexus.mgbackend.identity.service.JwtService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 公钥分发：SDK / GeoKG / OGE 各自缓存本端点即可就地验签，公钥轮换不需要重启它们。 */
@RestController
public class JwksController {

    private final JwtService jwtService;

    public JwksController(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @GetMapping("/.well-known/jwks.json")
    public Map<String, Object> jwks() {
        return jwtService.jwks();
    }
}
