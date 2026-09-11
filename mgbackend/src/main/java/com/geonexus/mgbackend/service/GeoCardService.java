package com.geonexus.mgbackend.service;

import cn.hutool.core.util.IdUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.geonexus.mgbackend.mapper.GeoCardMapper;
import com.geonexus.mgbackend.model.GeoCard;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * GeoCard 资产管理服务。
 *
 * <p>管理 GeoCard 的 CRUD、审核流转、与 Python 执行面的同步。</p>
 */
@Slf4j
@Service
public class GeoCardService extends ServiceImpl<GeoCardMapper, GeoCard> {

    /** 按审核状态查询。 */
    public List<GeoCard> listByStatus(String status) {
        return list(new LambdaQueryWrapper<GeoCard>()
                .eq(GeoCard::getStatus, status)
                .orderByDesc(GeoCard::getUpdateTime));
    }

    /** 全文搜索 GeoCard。 */
    public List<GeoCard> search(String keyword, String assetType, String region) {
        LambdaQueryWrapper<GeoCard> wrapper = new LambdaQueryWrapper<>();
        if (keyword != null && !keyword.isBlank()) {
            wrapper.and(w -> w
                    .like(GeoCard::getTitle, keyword)
                    .or()
                    .like(GeoCard::getDescription, keyword)
                    .or()
                    .like(GeoCard::getTags, keyword));
        }
        if (assetType != null && !assetType.isBlank()) {
            wrapper.eq(GeoCard::getAssetType, assetType);
        }
        if (region != null && !region.isBlank()) {
            wrapper.eq(GeoCard::getRegion, region);
        }
        wrapper.orderByDesc(GeoCard::getUpdateTime);
        return list(wrapper);
    }

    /** 创建草稿 GeoCard。 */
    public GeoCard createDraft(GeoCard card) {
        card.setId(IdUtil.fastSimpleUUID());
        card.setStatus("draft");
        card.setCreateTime(LocalDateTime.now());
        card.setUpdateTime(LocalDateTime.now());
        save(card);
        log.info("GeoCard created: id={} title={}", card.getId(), card.getTitle());
        return card;
    }

    /** 提交审核：draft → pending。 */
    public GeoCard submitForReview(String id) {
        GeoCard card = getById(id);
        if (card == null || !"draft".equals(card.getStatus())) {
            throw new IllegalArgumentException("Only draft cards can be submitted: " + id);
        }
        card.setStatus("pending");
        card.setUpdateTime(LocalDateTime.now());
        updateById(card);
        log.info("GeoCard submitted: id={}", id);
        return card;
    }

    /** 审核通过：pending → approved。 */
    public GeoCard approve(String id) {
        GeoCard card = getById(id);
        if (card == null || !"pending".equals(card.getStatus())) {
            throw new IllegalArgumentException("Only pending cards can be approved: " + id);
        }
        card.setStatus("approved");
        card.setUpdateTime(LocalDateTime.now());
        updateById(card);
        log.info("GeoCard approved: id={}", id);
        return card;
    }

    /** 驳回：pending → rejected。 */
    public GeoCard reject(String id) {
        GeoCard card = getById(id);
        if (card == null || !"pending".equals(card.getStatus())) {
            throw new IllegalArgumentException("Only pending cards can be rejected: " + id);
        }
        card.setStatus("rejected");
        card.setUpdateTime(LocalDateTime.now());
        updateById(card);
        log.info("GeoCard rejected: id={}", id);
        return card;
    }
}