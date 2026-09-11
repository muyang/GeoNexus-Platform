package com.geonexus.mgbackend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.geonexus.mgbackend.model.OgeCredential;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * OGE 凭证管理控制器集成测试。
 */
@SpringBootTest
@AutoConfigureMockMvc
class OgeCredentialControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void shouldCreateAndListCredential() throws Exception {
        OgeCredential cred = new OgeCredential();
        cred.setEndpoint("http://openge.org.cn/api");
        cred.setUsername("oge-test-user");
        cred.setPassword("test-password");
        cred.setNodeId("node.test");
        cred.setAppName("geonexus-test");

        String result = mockMvc.perform(post("/mogan/oge/credential")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cred)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.endpoint").value("http://openge.org.cn/api"))
                .andExpect(jsonPath("$.status").value("active"))
                .andReturn()
                .getResponse()
                .getContentAsString();

        OgeCredential created = objectMapper.readValue(result, OgeCredential.class);

        // 列表查询
        mockMvc.perform(get("/mogan/oge/credential/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].credentialId").value(created.getCredentialId()));

        // 按节点查询
        mockMvc.perform(get("/mogan/oge/credential/list").param("nodeId", "node.test"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].username").value("oge-test-user"));

        // 单个查询
        mockMvc.perform(get("/mogan/oge/credential/" + created.getCredentialId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.endpoint").value("http://openge.org.cn/api"));

        // 删除
        mockMvc.perform(delete("/mogan/oge/credential/" + created.getCredentialId()))
                .andExpect(status().isOk());
    }

    @Test
    void shouldValidateCredential() throws Exception {
        OgeCredential cred = new OgeCredential();
        cred.setEndpoint("http://openge.org.cn/api");
        cred.setUsername("test");
        cred.setPassword("secret");

        String result = mockMvc.perform(post("/mogan/oge/credential")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cred)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        OgeCredential created = objectMapper.readValue(result, OgeCredential.class);

        mockMvc.perform(post("/mogan/oge/credential/" + created.getCredentialId() + "/validate"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true));
    }
}