package com.geonexus.mgbackend.identity.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.geonexus.mgbackend.identity.model.SysDept;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface SysDeptMapper extends BaseMapper<SysDept> {

    /** 本部门及以下：ancestors 前缀匹配（RuoYi 的树查询方式）。 */
    @Select("SELECT * FROM sys_dept WHERE del_flag = '0' AND (dept_id = #{deptId} OR ancestors LIKE CONCAT(#{prefix}, '%'))")
    List<SysDept> findSelfAndDescendants(@Param("deptId") Long deptId, @Param("prefix") String prefix);
}
