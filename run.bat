@echo off
py -3.13 run.py
if %ERRORLEVEL% NEQ 0 (
    python run.py
)
