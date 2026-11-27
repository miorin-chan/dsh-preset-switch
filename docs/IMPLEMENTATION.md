# 切换会话模式实现说明

产品体验与成功标准见[产品设计](../DESIGN.md)。

## Host：命令而不是新的 Remote

Web 客户端的 Remote 命名空间来自构建期的装配，第三方 bundle 无法新增 namespace。
因此切换走现有命令通道：Host 注册 `/preset-switch <preset-id>`（及本地化别名），Client 通过 `live.command()` 提交，
与 `/permission` 保持同一路径。

命令处理器按四步执行：

1. 拒绝有未结束回合或正在压缩的会话。
2. 按 Agent 串行化，避免两次切换交错。
3. `agentPresets.resolve()` 校验目标定义，`agentPresets.recompose()` 在 Agent 的 scope 上挂载新组合。
4. 追加 `agent-preset/selected` 事件，使投影、恢复与各客户端界面从日志获得新身份。

`recompose()` 会发出 `tools/change`；下一回合 `request/header` 记录新工具清单，
工具增删写成 `tool-addition` / `tool-removal` developer 消息，系统提示以 in-history 方式更新，无需手工注入额外上下文。
Host 命令接受任意已声明、可挂载的 `preset-id`，不重复 Client 侧损失判断。

## Client：标题栏入口与动态行差分

- **插槽与控件复用**：入口注册在 `conversation.session.header.actions`（`order: -9`，紧跟官方只读模式名 `-10`），
  复用 `@deepseek-ai/dsh-client-ui-primitives` 提供的 `Menu`、`MenuItemButton`、`Modal`、`Button`、
  `Tag` 与 `IconChevronDownOutlineRegular`，仅保留触发器悬停展开与弹层换行的少量 `--dsw-alias-*` 主题 token 样式。
- **锚定与交互**：chevron 平时收起为零宽，悬停预设名或键盘聚焦时以 160ms 展开槽位；
  无法识别标签、不支持悬停或粗略指针设备常显。
  菜单使用 `Menu` 的 `portal` 模式并借助 CSS Anchor Positioning 锚定在触发器底边下方 6px；
  打开确认框时自动收起菜单并交由 `Modal` 管理遮罩、焦点与 Escape 返回。
- **动态影响分析**：菜单每次打开从 `agentPresets.list` 重新读取健康定义；
  点击目标后通过 `agentPresets.read` 读取当前与目标声明，
  解析 Loader 的 entry-list YAML（跳过 `name: cordis:group` 与无身份行，优先按 `id` 再按模块名匹配，
  `disabled: true` 记停用、`!!js` 条件视为启用），分出目标新增、目标缺失与目标停用三类结果决定是否弹窗。
- 仅修改 `config` 的行不计入移除或停用提示；命令行执行结果跟随在「设置」中手动选定的语言，自动跟随浏览器语言时回退英文。
