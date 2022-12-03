<h1 align="center">Architecture</h1>

This project is deployed as a single binary that listens on port for:

1. Postmark webhook requests: Any emails sent to @whotookmy.money are sent to
   forwarded to the binary via a postmark webhook. 

2. Browser requests for a user's dashboard: The dashboard is protected such that
   only the binary can give you a valid URL to use. This happens when you sign
   up for whootookmy.money.

Ansible is used to do the actual deployment (and provisioning work). Right now,
the binary is deployed to a single Digital Ocean VM.
The deployment processes creates a SystemD service file that executes the binary
and restarts it if it fails. The service file is checked-in to the repo.

All data is stored in a Sqlite3 file, both during development and in production.
In production, the file is created adjacent  to the deployed binary.

A SystemD timer runs daily to back up the Sqlite3 database to an AWS S3 bucket.
This timer file is also checked-in to the repo.


