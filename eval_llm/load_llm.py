import os
from time import perf_counter
from llama_cpp import Llama

os.environ["CUDA_PATH"] = r"D:\ml_projects\cuda"
cuda_bin = r"D:\ml_projects\cuda\bin\x64"
os.environ["PATH"] = cuda_bin + os.pathsep + os.environ.get("PATH", "")
cuda_dll_directory = os.add_dll_directory(cuda_bin)

print("Loading Qwen3.8-27B ...", flush=True)

llm = Llama(
    model_path=r"D:\ml_projects\models\Qwen3.8-27B\Qwen3.8-27B-Q4_K_M.gguf",
    n_gpu_layers=52,
    n_ctx=10000,
    n_batch=512,
    n_ubatch=128,
    flash_attn=True,
    verbose=True,     # Show loading, GPU and memory logs
    no_perf=False,    # Collect performance timings
)

# Qwen's prompt format, with thinking disabled for this short test.

question = "can you read a image and help me generate the correct prompt for editing it?"

prompt = (
    f"<|im_start|>user\n{question}<|im_end|>\n"
    "<|im_start|>assistant\n<think>\n\n</think>\n\n"
)

try:
    started_at = perf_counter()
    result = llm.create_completion(
        prompt=prompt,
        max_tokens=4096,
        temperature=0.5,
        top_p=0.9,
        top_k=20,
        stop=["<|im_end|>", "<|endoftext|>"],
    )
    elapsed_seconds = perf_counter() - started_at
    print(result["choices"][0]["text"].strip())
    print(f"\nTime elapsed: {elapsed_seconds:.2f} seconds")
finally:
    llm.close()
