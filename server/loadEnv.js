// Load .env once; .env values override shell env so SOURCE=github wins over GITLAB_* in the terminal.
import dotenv from "dotenv";

dotenv.config({ override: true });
