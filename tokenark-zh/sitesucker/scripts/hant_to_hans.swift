import Foundation

guard CommandLine.arguments.count == 3 else {
    fputs("usage: hant_to_hans.swift INPUT OUTPUT\n", stderr)
    exit(2)
}

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let data = try Data(contentsOf: input)
guard var text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .utf16) else {
    throw NSError(domain: "TokenArkLocalization", code: 1, userInfo: [NSLocalizedDescriptionKey: "unsupported text encoding"])
}
if let converted = text.applyingTransform(StringTransform(rawValue: "Hant-Hans"), reverse: false) {
    text = converted
}

// Normalize common Taiwan/Hong Kong UI terms to Mainland Simplified Chinese.
let mainlandTerms: [(String, String)] = [
    ("正體中文化", "简体中文化"), ("正体中文化", "简体中文化"),
    ("网页检视", "网页视图"), ("檢視", "视图"), ("检视", "视图"),
    ("自訂", "自定义"), ("自订", "自定义"),
    ("荧幕", "屏幕"), ("使用者", "用户"), ("套用", "应用"),
    ("网域", "域"), ("取代", "替换"), ("建立", "创建"),
    ("帳號", "账号"), ("帐号", "账号"),
    ("網際網路", "互联网"), ("网际网路", "互联网"),
    ("網路", "网络"), ("网路", "网络"),
    ("資料", "数据"), ("资料", "数据"),
    ("套件", "软件包"), ("字元", "字符"),
    ("檔案夾", "文件夹"), ("档案夹", "文件夹"),
    ("檔案", "文件"), ("档案", "文件"),
    ("視窗", "窗口"), ("视窗", "窗口"),
    ("說明", "帮助"), ("说明", "帮助"),
    ("歷程", "历史"), ("历程", "历史"),
    ("伫列", "队列"), ("佇列", "队列"),
    ("閒置", "空闲"), ("闲置", "空闲"),
    ("標準", "标准"), ("標準", "标准"),
    ("設定", "设置"), ("设定", "设置"),
    ("儲存", "保存"), ("储存", "保存"),
    ("預設", "默认"), ("预设", "默认"),
    ("選取", "选择"), ("选取", "选择"),
    ("拷貝", "复制"), ("拷贝", "复制"),
    ("剪下", "剪切"),
    ("還原", "撤销"), ("还原", "撤销"),
    ("貼上", "粘贴"), ("贴上", "粘贴"),
    ("聯絡人", "联系人"), ("联络人", "联系人"),
    ("聽寫", "听写"), ("听写", "听写"),
    ("應用程式", "应用程序"), ("应用程式", "应用程序"),
    ("連線", "连接"), ("连线", "连接"),
    ("鏈結", "链接"), ("链结", "链接"),
    ("登入", "登录"), ("登出", "退出登录"),
    ("目前", "当前"), ("下載", "下载"), ("網站", "网站"),
    ("網址", "网址"), ("支援", "支持"), ("記錄", "记录"),
    ("檢查", "检查"), ("關閉", "关闭"), ("開啟", "打开"),
    // Keep lexical choices consistent with Mainland Chinese system UI.
    ("压缩封存档", "压缩归档文件"), ("壓縮封存檔", "压缩归档文件"),
    ("音讯档", "音频文件"), ("音訊檔", "音频文件"),
    ("视讯档", "视频文件"), ("視訊檔", "视频文件"),
    ("视讯", "视频"), ("視訊", "视频"),
    ("页签", "选项卡"), ("頁籤", "选项卡"),
    ("栏位", "字段"), ("欄位", "字段"),
    ("拖曳", "拖动"), ("拖曳到", "拖动到"),
    ("警告警报", "警告"), ("警告警報", "警告"),
    ("记忆体", "内存"), ("記憶體", "内存"),
    ("载入", "加载"), ("載入", "加载"),
    ("副档名", "扩展名"), ("副檔名", "扩展名"),
    ("资讯", "信息"), ("資訊", "信息"),
    ("应用程序", "应用"), ("應用程式", "应用"),
]
for (old, replacement) in mainlandTerms {
    text = text.replacingOccurrences(of: old, with: replacement)
}
try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
try text.write(to: output, atomically: true, encoding: .utf8)
