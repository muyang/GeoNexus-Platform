package com.geonexus.mgbackend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.geonexus.mgbackend.model.GeoCard;
import com.geonexus.mgbackend.service.GeoCardService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * GeoCard 控制器集成测试（使用 H2 内存数据库）。
 */
@SpringBootTest
@AutoConfigureMockMvc
class GeoCardControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private GeoCardService geoCardService;

    @Test
    void shouldCreateAndListGeoCard() throws Exception {
        // 创建草稿
        GeoCard card = new GeoCard();
        card.setTitle("Test Flood Map");
        card.setAssetType("data");
        card.setProvider("Test Lab");
        card.setNodeId("node.test");
        card.setRegion("Southeast Asia");
        card.setDescription("A test GeoTIFF for flood analysis.");

        String result = mockMvc.perform(post("/mogan/geocard")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(card)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Test Flood Map"))
                .andExpect(jsonPath("$.status").value("draft"))
                .andReturn()
                .getResponse()
                .getContentAsString();

        GeoCard created = objectMapper.readValue(result, GeoCard.class);

        // 提交审核
        mockMvc.perform(post("/mogan/geocard/" + created.getId() + "/submit"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("pending"));

        // 审核通过
        mockMvc.perform(post("/mogan/geocard/" + created.getId() + "/approve"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"));
    }

    @Test
    void shouldSearchGeoCard() throws Exception {
        // 创建卡片
        GeoCard card = new GeoCard();
        card.setTitle("NDVI Amazon 2015");
        card.setAssetType("data");
        card.setProvider("EO Lab");
        card.setNodeId("node.amazon");
        card.setRegion("South America");
        card.setDescription("NDVI composite for Amazon.");
        card.setStatus("approved");

        mockMvc.perform(post("/mogan/geocard")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(card)))
                .andExpect(status().isOk());

        // 搜索
        mockMvc.perform(get("/mogan/geocard/search")
                        .param("keyword", "NDVI")
                        .param("region", "South America"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("NDVI Amazon 2015"));

        // 种子数据也应该被搜索到
        mockMvc.perform(get("/mogan/geocard/search")
                        .param("keyword", "Sentinel"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Sentinel-2 Water Extent STAC Feed"));
    }

    @Test
    void shouldRejectInvalidTransition() throws Exception {
        // 不能跳过 draft → pending 直接 approve
        GeoCard card = new GeoCard();
        card.setTitle("Test Card");
        card.setAssetType("data");
        card.setProvider("Test");
        card.setNodeId("node.test");
        card.setRegion("Global");

        String result = mockMvc.perform(post("/mogan/geocard")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(card)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        GeoCard created = objectMapper.readValue(result, GeoCard.class);

        // 尝试直接 approve draft 应该抛 IllegalArgumentException
        assertThrows(IllegalArgumentException.class, () -> {
            geoCardService.approve(created.getId());
        });
    }
}