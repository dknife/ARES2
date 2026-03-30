import torch
from pathlib import Path
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer
from threading import Thread

model_name = "LGAI-EXAONE/EXAONE-3.5-2.4B-Instruct"
streaming = True    # choose the streaming option

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    dtype=torch.bfloat16,
    trust_remote_code=True,
    device_map="auto"
)
tokenizer = AutoTokenizer.from_pretrained(model_name)

class CodeAssistant:
    def __init__(self, model, tokenizer, device="cuda"):
        self.model = model
        self.tokenizer = tokenizer
        self.device = device

    def ask_about_code(self, user_query):
        system_prompt = f"""
당신은 아이들에게 라즈베리 파이를 쉽게 조작할 수 있게 도와주는 인공지능입니다.
이 프로젝트에는 라즈베리 파이를 이용한 로봇 조작을 쉽게 하기 위한 구글의 Blockly 라이브러리가 설치되어 있습니다.
질문을 받을 상대는 초등학생 수준의 아동이므로 쉽고 간결하게 설명해 주어야 합니다. 질문자는 파이썬 코드 등을 조작하지 않으며 블록코딩만을 이용해 로봇을 조작합니다.

블록의 종류는 다음과 같습니다.

=로봇 조작 블록=
램프 세팅: 5개의 램프를 켜고 끌 수 있습니다.
메세지 보내기: 화면에 원하는 메세지를 출력합니다.
장치 상태 확인: 로봇과 연결되었는지 확인합니다.
거리 측정: 거리 센서를 이용해 거리를 측정합니다.
자기 측정: 자기 센서를 이용해 거리를 측정합니다.
부저 울리기: 특정 헤르츠의 소리를 원하는 시간 만큼 울릴 수 있습니다.
전후좌우 이동: 각각의 방향으로 이동 가능한 노드가 있으며 특정 시간 만큼 움직이거나 계속 움직이게 할 수 있습니다.
멈추기: 이동을 멈춥니다.

=제어문 블록=
기다리기: 코드에 원하는 시간만큼 딜레이를 줍니다.
반복: 반복문 안의 코드를 특정 횟수만큼 반복합니다.
변수: 변수를 선언하고 값을 지정합니다.
수학: 간단한 사칙연산과 크기 비교 기능이 있습니다.
"""
        prompt = f"""{user_query}"""

        # 메시지 생성
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]

        # 토큰 입력 부분
        input_ids = tokenizer.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_tensors="pt"
        )

        if streaming:
            streamer = TextIteratorStreamer(tokenizer)
            thread = Thread(target=model.generate, kwargs=dict(
                input_ids=input_ids.to(self.device),
                eos_token_id=tokenizer.eos_token_id,
                max_new_tokens=2048,
                do_sample=True,
                temperature=0.6,
                top_p=0.95,
                streamer=streamer
            ))
            thread.start()

            for text in streamer:
                print(text, end="", flush=True)
        else:
            output = model.generate(
                input_ids.to(self.device),
                eos_token_id=tokenizer.eos_token_id,
                max_new_tokens=256,
                do_sample=True,
                temperature=0.6,
                top_p=0.95,
            )
            print(tokenizer.decode(output[0]))

        return 'text here'

def call_ai(prompt):
    assistant = CodeAssistant(model, tokenizer)
    answer = assistant.ask_about_code(prompt)
    return answer
