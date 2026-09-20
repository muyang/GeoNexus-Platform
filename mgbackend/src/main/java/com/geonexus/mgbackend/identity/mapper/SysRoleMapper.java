package com.geonexus.mgbackend.identity.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.geonexus.mgbackend.identity.model.SysRole;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface SysRoleMapper extends BaseMapper<SysRole> {

    @Select("SELECT r.* FROM sys_role r JOIN sys_user_role ur ON ur.role_id = r.role_id "
          + "WHERE ur.user_id = #{userId} AND r.status = '0' AND r.del_flag = '0'")
    List<SysRole> findByUserId(@Param("userId") Long userId);

    @Select("SELECT role_id FROM sys_role WHERE role_key = #{roleKey} AND del_flag = '0'")
    Long findIdByKey(@Param("roleKey") String roleKey);

    @Select("SELECT dept_id FROM sys_role_dept WHERE role_id = #{roleId}")
    List<Long> findCustomDeptIds(@Param("roleId") Long roleId);
}
