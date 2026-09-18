@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

git pull --ff-only
if errorlevel 1 (
    echo.
    echo Update failed. See the Git error above.
    echo This folder must have been downloaded using git clone.
    pause
    popd
    exit /b 1
)

echo.
echo Update complete!
echo Open chrome://extensions and click Reload for BillNext.
echo Then refresh your Bilibili page.
pause
popd
endlocal
