# Immunization Dashboard

This is a frontend-only proof of concept (POC) web client UI for the Immunization Dashboard example project. It requires a backend server and associated service dependencies. The following default environment variables should be overriden as necessary for your environment.

```sh
IMMUNIZATION_SERVER_URL=//localhost:3000
```

## Development server

To start a local development server, run:

```bash
npm run start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Running as a Docker Container

To run the application on docker, run 
```bash
docker build -t immunization-dashboard . 
```

Once that's done, run
```bash
docker run -p 4200:80 immunization-dashboard
```

Open your browser and navigate to `http://localhost:4200/`.

# License

Copyright © 2025 Preston Lee. All rights reserved. Released under the Apache 2.0 license.
