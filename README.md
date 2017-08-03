# Origo server

### Install Origo server
The minimum requirements are:

  * [Git](https://git-scm.com/)
  * [Node.js](https://nodejs.org/) (version 4 or higher is recommended)

 1. To get your own local copy of Origo server use git to clone the repository with the command below:

   		  git clone https://github.com/origo-map/origo-server.git

 2. To install the required node dependencies run the following command from the root directory of origo-server:

  		   npm install

 3. To start Origo server, run:

   		  node app.js

The server will be available at <http://localhost:3001/origoserver>.

The database dependencies in Origo server are optional and if any of the modules fails to install it will be skipped. Currently Origo server supports MS SQL Server, Oracle and PostgreSQL.

### Install Origo server as a Windows service
Origo can be installed as a Windows service. Run the following command from tasks:

  		   node create_windowsservice.js

Make sure the paths specified in create_windowsservice.js are correct.

To uninstall run the following command:

  		   node uninstall_windowsservice.js
