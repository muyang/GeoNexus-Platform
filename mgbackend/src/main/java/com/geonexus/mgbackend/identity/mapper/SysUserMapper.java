package com.geonexus.mgbackend.identity.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.geonexus.mgbackend.identity.model.SysUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface SysUserMapper extends BaseMapper<SysUser> {

    @Select("SELECT * FROM sys_user WHERE (user_name = #{login} OR email = #{login}) AND del_flag = '0'")
    SysUser findByLogin(@Param("login") String login);

    /** 同部门用户（数据范围"本部门/本部门及以下"用）。 */
    @Select("SELECT user_id FROM sys_user WHERE dept_id IN (${deptIds}) AND del_flag = '0'")
    List<Long> findUserIdsByDepts(@Param("deptIds") String deptIdsCsv);
}
