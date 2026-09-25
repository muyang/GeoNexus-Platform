import { describe, expect, it } from 'vitest'
import {
  EMPTY, KINDS, approvalTag, dataOriginTag, runTag, scopeTag, typeLabel, visibilityTag
} from '@/lib/labels'

/** ⑧ 统一视觉词表：九个模块的"状态标签 + 空状态文案"都从这里取。
 *  这几条断言锁住的是"同一个意思必须是同一种说法/同一档颜色"，
 *  以及"未知取值必须降级为最保守的一档"。 */
describe('lib/labels', () => {
  it('类型词表覆盖 GeoCard 的五个角色', () => {
    expect(KINDS.map((k) => k.key)).toEqual(['all', 'data', 'model', 'skill', 'knowledge', 'compute'])
    expect(typeLabel('skill')).toBe('算子')
    expect(typeLabel('unknown-kind')).toBe('unknown-kind')   // 未知键原样返回，不显示空白
    expect(typeLabel(undefined)).toBe('数据')
  })

  it('可见性：未知取值一律按受限处理，绝不显示成公开', () => {
    expect(visibilityTag('public')).toEqual({ text: '公开', cls: 'tag-ok' })
    expect(visibilityTag('restricted').cls).toBe('tag-bad')
    expect(visibilityTag('secret-internal-thing').cls).toBe('tag-bad')
    expect(visibilityTag(undefined).text).toBe('受限')
  })

  it('参数范围、审批、运行、数据来源各有一档固定配色', () => {
    expect(scopeTag('fixed').cls).toBe('tag-warn')
    expect(scopeTag('reusable').cls).toBe('tag-ok')
    expect(approvalTag('pending').cls).toBe('tag-warn')
    expect(approvalTag('rejected').cls).toBe('tag-bad')
    expect(runTag('running').cls).toBe('tag-info')
    expect(runTag('succeeded').cls).toBe('tag-ok')
    expect(runTag('failed').cls).toBe('tag-bad')
    expect(dataOriginTag(true).text).toContain('合成')
    expect(dataOriginTag(false).cls).toBe('tag-ok')
  })

  it('空状态文案都写清"没有什么"，且不含未渲染的 markdown 记号', () => {
    for (const [key, text] of Object.entries(EMPTY)) {
      expect(text.length, key).toBeGreaterThan(0)
      expect(text, key).not.toMatch(/\*\*/)
    }
    expect(EMPTY.deliverables).toContain('运行一次方案')
    expect(EMPTY.nodes).toContain('提问')
  })
})
