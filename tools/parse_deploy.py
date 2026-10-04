"""解析 EdgeOne CLI 的部署输出，判断成功与否。

CLI 即使加了 --json 仍会打印 [cli] 装饰日志，所以不能假定最后一行
就是 JSON。这里反向遍历逐行尝试，拿到第一个能解析的 JSON 对象。

退出码：0=部署成功，1=失败或输出无法解析。
"""

import json
import sys

LOG_FILE = "deploy-output.log"
URL_FILE = "DEPLOY_URL"


def find_json_object(text):
    """从日志文本里找出 CLI 输出的 JSON 对象。"""
    for line in reversed(text.splitlines()):
        line = line.strip()
        if not (line.startswith("{") and line.endswith("}")):
            continue
        try:
            return json.loads(line)
        except Exception:
            continue
    return None


def main():
    try:
        with open(LOG_FILE, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError as exc:
        print("::error::无法读取部署日志 {}: {}".format(LOG_FILE, exc))
        return 1

    result = find_json_object(text)
    if result is None:
        print("::error::部署输出中未找到合法 JSON，CLI 可能未正常启动")
        return 1

    if result.get("status") != "success":
        detail = result.get("error") or result.get("status") or "未知原因"
        print("::error::部署失败: {}".format(detail))
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
