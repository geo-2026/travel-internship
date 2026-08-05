# -*- coding: utf-8 -*-
"""배포 주소로 학생 배포용 QR 코드를 만든다.

사용:
    pip install "qrcode[pil]"
    python tools/make_qr.py https://<교사계정>.github.io/travel-internship/

결과: docs/qr.png
"""
import os
import sys


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    url = sys.argv[1].strip()
    if not url.startswith("http"):
        print("배포 주소를 http(s):// 로 시작하도록 입력해 주세요.")
        return 1

    try:
        import qrcode
    except ImportError:
        print('qrcode 가 없습니다. 먼저 실행하세요:  pip install "qrcode[pil]"')
        return 1

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "docs")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "qr.png")

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,  # 인쇄물에서 잘 읽히는 수준
        box_size=10,
        border=4
    )
    qr.add_data(url)
    qr.make(fit=True)
    qr.make_image(fill_color="black", back_color="white").save(out_path)

    print(f"만들었습니다: {out_path}")
    print(f"대상 주소: {url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
