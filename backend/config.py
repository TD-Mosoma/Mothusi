import os
from crewai import LLM

llm = LLM(
    model="openai/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.environ["NVIDIA_API_KEY"],
    custom_openai=True,   # Critical: force use of NVIDIA's endpoint, do not fall back to OpenAI
    temperature=0.3,
    timeout=120.0,
)