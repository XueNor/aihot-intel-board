"""解析 EdgeOne CLI 的部署输出，判断成功与否。

CLI 即使加了 --json 仍会打印 [cli] 装饰日志，所以不能假定最后一行
就是 JSON。这里反向遍历逐行尝试，拿到第一个能解析的 JSON 对象。

退出码：0=部署成功，1=失败或输出无法解析。
"""

import json
import re
import sys

LOG_FILE = "deploy-output.log"
URL_FILE = "DEPLOY_URL"

# CLI 输出可能带 ANSI 颜色控制符，去掉后再判断是否是 JSON
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def find_json_object(text):
    """从日志文本里找出 CLI 输出的 JSON 对象。

    先去掉 ANSI 颜色码，再按行尝试；整段文本也尝试一次，
    以应对 JSON 被折行成多行的情况。
    """
    clean = ANSI_RE.sub("", text)

    for line in reversed(clean.splitlines()):
        line = line.strip()
        if not (line.startswith("{") and line.endswith("}")):
            continue
        try:
            return json.loads(line)
        except Exception:
            continue

    # 逐行失败则尝试整体解析（CLI 可能输出格式化后的多行 JSON）
    try:
        obj = json.loads(clean.strip())
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


def salvage_url(text):
    """兜底：从日志里抓取部署地址。仅在已确认部署成功时使用。"""
    if "Deploy Success" not in text and "EDGEONE_DEPLOY_URL" not in text:
        return ""
    match = re.search(r"https://[\w.-]*edgeone\.(?:dev|app|co)[^\s\"'<>]*",
                      ANSI_RE.sub("", text))
    return match.group(0).rstrip("\"'") if match else ""


def main():
    try:
        with open(LOG_FILE, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError as exc:
        print("::error::无法读取部署日志 {}: {}".format(LOG_FILE, exc))
        return 1

    result = find_json_object(text)

    # 解析失败时把日志尾部打出来，否则无法从 Actions 页面判断原因。
    if result is None:
        # 兜底：JSON 没找到，但日志里有Deploy Success 且能抓到 URL，
        # 说明部署实际已成功，只是 CLI 输出格式与预期不符。
        url = salvage_url(text)
        if url:
            print("::warning::未找到 JSON，已从日志中提取 URL 判定为成功")
            with open(URL_FILE, "w", encoding="utf-8") as fh:
                fh.write(url)
            print("::notice title=部署成功（兜底）::{}".format(url))
            return 0
        print("::error::部署输出中未找到合法 JSON，CLI 可能未正常启动")
        print("---- deploy-output.log 末尾 30 行 ----")
        for line in text.strip().splitlines()[-30:]:
            print(line)
        print("---- 日志结束（共 {} 字节）----".format(len(text)))
        return 1

    if result.get("status") != "success":
        detail = result.get("error") or result.get("status") or "未知原因"
        print("::error::部署失败: {}".format(detail))
        print("---- deploy-output.log 末尾 20 行 ----")
        for line in text.strip().splitlines()[-20:]:
            print(line)
        return 1

    url = result.get("url", "")
    with open(URL_FILE, "w", encoding="utf-8") as fh:
        fh.write(url)

    print("::notice title=部署成功::{}".format(url))
    print("项目 ID: {}".format(result.get("projectId", "")))
    print("部署 ID: {}".format(result.get("deploymentId", "")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
