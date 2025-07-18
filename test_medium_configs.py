#!/usr/bin/env python3
"""
mediumモデルの設定テスト用スクリプト
異なる設定でテストを実行し、結果を比較します
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'whisper-server', 'src'))

from whisper_server.config import WhisperModelConfigs, CURRENT_MEDIUM_CONFIG_VERSION

def test_medium_configs():
    """mediumモデルの設定を表示・比較"""
    print("=== Medium Model Configuration Test ===\n")
    
    model_name = "kotoba-tech/kotoba-whisper-v2.0-faster"
    
    # 利用可能な設定を取得
    available_configs = WhisperModelConfigs.get_available_configs(model_name)
    print(f"利用可能な設定:")
    for version, description in available_configs.items():
        print(f"  {version}: {description}")
    
    print(f"\n現在のデフォルト設定バージョン: {CURRENT_MEDIUM_CONFIG_VERSION}")
    
    # 各設定の詳細を表示
    print("\n=== 設定詳細 ===")
    for version in available_configs.keys():
        config = WhisperModelConfigs.get_config(model_name, int(version))
        print(f"\n設定 V{version} ({available_configs[version]}):")
        print(f"  beam_size: {config.beam_size}")
        print(f"  chunk_length: {config.chunk_length}")
        print(f"  vad_filter: {config.vad_filter}")
        print(f"  condition_on_previous_text: {config.condition_on_previous_text}")
        print(f"  temperature: {config.temperature}")
    
    print("\n=== 設定変更方法 ===")
    print("1. config.py の CURRENT_MEDIUM_CONFIG_VERSION を変更")
    print("2. Pythonサーバーを再起動")
    print("3. mediumモデルに切り替えて音声認識実行")
    print("4. ログでカバレッジ率と処理結果を確認")
    
    print("\n=== 推奨テスト順序 ===")
    print("1. 設定V1（標準） → ベースライン確認")
    print("2. 設定V3（VAD無効） → VADの影響確認") 
    print("3. 設定V2（短チャンク） → チャンク長の影響確認")

def change_config_version(version: int):
    """設定バージョンを変更する関数（手動実行用）"""
    config_file = os.path.join(os.path.dirname(__file__), 
                              'whisper-server', 'src', 'whisper_server', 'config.py')
    
    print(f"設定バージョンを {version} に変更するには:")
    print(f"1. {config_file} を開く")
    print(f"2. CURRENT_MEDIUM_CONFIG_VERSION = {version} に変更")
    print(f"3. ファイルを保存")
    print(f"4. Pythonサーバーを再起動")

if __name__ == "__main__":
    test_medium_configs()
    
    if len(sys.argv) > 1:
        try:
            version = int(sys.argv[1])
            print(f"\n{'='*50}")
            change_config_version(version)
        except ValueError:
            print("\n使用法: python test_medium_configs.py [設定バージョン番号]")
            print("例: python test_medium_configs.py 2")