---
title: Springboot实现数据库读写分离
tags:
  - 后端
  - 数据库
date: 2023-03-11 16:09:09
categories: 学习
toc:
  showListNumber: false
  maxDepth: 6
  minDepth: 1
---

## 前言
由于shardingsphere官方文档的[配置参考](https://shardingsphere.apache.org/document/current/cn/quick-start/shardingsphere-jdbc-quick-start/)用了报错，网上的也基本用不了，于是参考其他博客，通过aop手动更改数据源。
## 参考博客
[第一篇](https://www.modb.pro/db/155331)
[第二篇](https://www.cnblogs.com/wuyoucao/p/10965903.html)
前置操作：配置好mysql的读写分离
## Springboot yml配置文件(部分)
```yml
spring:
  datasource:
    master:
      driver-class-name: com.mysql.cj.jdbc.Driver
      jdbc-url: 主数据库链接
      username: 用户
      password: 密码
    slave0:
      driver-class-name: com.mysql.cj.jdbc.Driver
      jdbc-url: 从数据库链接
      username: 用户
      password: 密码
    其他从数据库:
      ...
```
配置了多个数据源，因此需要一个配置类，设置当前使用哪个数据源。
## 枚举类
先创建一个枚举类，作为数据源的key
```Java
public enum DBTypeEnum {
    MASTER, SLAVE0;
}
```
## 数据源配置类
```Java
@Configuration
public class DataSourceConfig {
    @Bean
    @ConfigurationProperties("spring.datasource.master")
    public DataSource masterDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    @ConfigurationProperties("spring.datasource.slave0")
    public DataSource slave0DataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    public DataSource myRoutingDataSource(@Qualifier("masterDataSource") DataSource masterDataSource,
                                          @Qualifier("slave0DataSource") DataSource slave0DataSource) {
        // 把所有数据源放入map中待更换
        HashMap<Object, Object> targetDataSources = new HashMap<>();
        targetDataSources.put(DBTypeEnum.MASTER, masterDataSource);
        targetDataSources.put(DBTypeEnum.SLAVE0, slave0DataSource);

        MyRoutingDataSource myRoutingDataSource = new MyRoutingDataSource();
        // 设置默认数据源
        myRoutingDataSource.setDefaultTargetDataSource(masterDataSource);
        myRoutingDataSource.setTargetDataSources(targetDataSources);
        return myRoutingDataSource;
    }
}
```
## mybatis配置类
配置mybatis，使用myRoutingDataSource这个数据源
```Java
@EnableTransactionManagement(order = 10) // 设置事务优先级，这很重要！！
@Configuration
public class MyBatisConfig {
    @Resource(name = "myRoutingDataSource")
    private DataSource myRoutingDataSource;

    @Bean
    public SqlSessionFactory sqlSessionFactory() throws Exception {
        SqlSessionFactoryBean sqlSessionFactoryBean = new SqlSessionFactoryBean();
        sqlSessionFactoryBean.setDataSource(myRoutingDataSource);
        return sqlSessionFactoryBean.getObject();
    }

    @Bean
    public PlatformTransactionManager platformTransactionManager() {
        return new DataSourceTransactionManager(myRoutingDataSource);
    }
}
```
## 把数据源配置到线程上下文中
```Java
public class DBContextHolder {
    private static final ThreadLocal<DBTypeEnum> contextHolder = new ThreadLocal<>();

    public static DBTypeEnum get() {
        if (contextHolder.get() == null)
            contextHolder.set(DBTypeEnum.MASTER);
        return contextHolder.get();
    }

    public static void master() {
        contextHolder.set(DBTypeEnum.MASTER);
        System.out.println("切换到master");
    }

    public static void slave() {
        contextHolder.set(DBTypeEnum.SLAVE0);
    }
}
```
## 重写determineCurrentLookupKey切换数据源
```Java
public class MyRoutingDataSource extends AbstractRoutingDataSource {
    @Override
    protected Object determineCurrentLookupKey() {
        return DBContextHolder.get();
    }
}
```
## AOP
最后，通过aop，在每次执行mybatis的前判断sql类型，读操作分配从数据库，写操作分配到主数据库。
根据参考博客，有可能存在必须从主库读的情况，因此加一个注解表示强制从主库读：
```Java
@Aspect
@Component
public class DataSourceAop implements Ordered {
    @Pointcut("!@annotation(com.wolf1024hzx.annotation.Master) " +
            "|| execution(* com.wolf1024hzx.service..*.get*(..)))")
    public void readPointcut() {

    }

    @Pointcut("@annotation(com.wolf1024hzx.annotation.Master) " +
            "|| execution(* com.wolf1024hzx.service..*.create*(..)) " +
            "|| execution(* com.wolf1024hzx.service..*.update*(..)) " +
            "|| execution(* com.wolf1024hzx.service..*.delete*(..)) ")
    public void writePointcut() {

    }

    @Before("readPointcut()")
    public void read() {
        DBContextHolder.slave();
    }

    @Before("writePointcut()")
    public void write() {
        DBContextHolder.master();
    }

    @Override
    public int getOrder() {
        return 0;
    }
}
```
注意这里重写了getOrder方法，这是因为按照第一篇博客的配置，会发现服务器的执行顺序是springboot拿到数据源->尝试执行sql->aop->执行sql，这样一来aop改变数据源就没有效果，全是从主机读写。因此需要把数据库事务的优先级调低，把aop操作的优先级调高，确保数据源被成功切换。
可以通过数据库通用查询日志（general_log）观察读写分离是否成功。