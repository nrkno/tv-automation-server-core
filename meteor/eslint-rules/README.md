The typescript in this folder needs compiling before use, so it is easiest to commit the compiled js too.

It can be recompiled with `meteor npx tsc eslint-rules/*.ts --module commonjs`, then the rules can be referenced as if they are npm installed.
