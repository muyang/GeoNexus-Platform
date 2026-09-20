package com.geonexus.mgbackend.identity.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.geonexus.mgbackend.identity.model.SysLogininfor;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface SysLogininforMapper extends BaseMapper<SysLogininfor> {

    @Select("SELECT COUNT(*) FROM sys_logininfor WHERE user_name = #{userName} AND status = '1' "
          + "AND login_time > #{since}")
    int countFailuresSince(@Param("userName") String userName, @Param("since") java.time.LocalDateTime since);
}
