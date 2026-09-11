FROM public.ecr.aws/lambda/python:3.12

COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_CACHE=1

# Dependencies in their own layer, keyed on the lockfile alone, so editing
# source doesn't reinstall LangChain every build. Installed --system: the
# Lambda runtime imports from the image's site-packages, not a venv.
COPY pyproject.toml uv.lock ./
RUN uv export --frozen --no-dev --no-emit-project -o requirements.txt \
    && uv pip install --system -r requirements.txt \
    && rm requirements.txt

COPY src/ ${LAMBDA_TASK_ROOT}/

CMD ["rayner_agent.lambda_handler.handler"]
