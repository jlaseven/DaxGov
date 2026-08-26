CYBERSECURITY GOVERNANCE DASHBOARD - WINDOWS
==============================================

System requirements
-------------------
- Windows 10 or Windows 11, 64-bit (x64)
- No Node.js, npm, database software, or installation is required

How to run
----------
1. Copy the entire "for windows" folder to the Windows computer.
2. Double-click Governance Dashboard.exe.
3. Keep the black console window open while using the dashboard.
4. The dashboard will open automatically in your default browser.
5. If it does not open automatically, use the address printed in the console,
   normally http://127.0.0.1:5174.
6. To stop the dashboard, close the black console window.

Windows security prompt
-----------------------
This executable is locally built and is not digitally signed. Windows
SmartScreen may display a warning. If you trust the source of this folder,
select "More info", then "Run anyway". Your organization's security policy
may require approval from IT before an unsigned application can run.

Data storage and backup
-----------------------
On first run, the database included in the executable is copied to:

  %LOCALAPPDATA%\Cybersecurity Governance Dashboard\governance.db

Later runs reuse that file, so records remain available after the application
is closed or the executable is replaced. To back up the dashboard:

1. Close Governance Dashboard.exe.
2. Press Windows+R.
3. Enter:
   %LOCALAPPDATA%\Cybersecurity Governance Dashboard
4. Copy governance.db to a secure backup location.

To restore a backup, close the application and replace governance.db in that
same folder with the backed-up copy.

Network and privacy
-------------------
The dashboard runs only on the Windows computer and listens on localhost. It
does not need an internet connection and does not send application data to a
remote service.

Troubleshooting
---------------
- Browser shows "This site can't be reached": confirm the black console window
  is still open and use the exact localhost address shown there.
- Windows blocks the file: ask IT to approve or allow the unsigned executable.
- Dashboard does not start: close any other copy already running, then try
  again. The application automatically tries ports 5174 through 5184.
- To start with the original packaged data again: close the application, back
  up governance.db, then remove it from the data-storage folder. The next run
  creates a fresh copy from the executable.
