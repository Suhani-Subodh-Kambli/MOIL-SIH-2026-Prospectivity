@echo off
echo ============================================================
echo MOIL SIH 2026 - AI Mining Intelligence Command Center
echo ============================================================
echo.
echo Starting OreTwin Backend API (Node + Express + MongoDB)...
start "OreTwin API" cmd /k "cd server && npm run dev"

echo Starting OreTwin Frontend (React + Vite)...
start "OreTwin Frontend" cmd /k "cd client && npm run dev"

echo.
echo Both servers are launching:
echo   - Backend:  http://localhost:5000
echo   - Frontend: http://localhost:5173
echo.
echo Default Demo Credentials:
echo   Email:    demo@oretwin.ai
echo   Password: password123
echo ============================================================
pause
