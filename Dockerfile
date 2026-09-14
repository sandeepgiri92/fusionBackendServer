FROM node:22-bookworm

# ==========================================
# Install LibreOffice for DOCX -> PDF
# ==========================================
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libreoffice \
       fonts-liberation \
       fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

# ==========================================
# Application directory
# ==========================================
WORKDIR /app

# ==========================================
# Install Node dependencies
# ==========================================
COPY package*.json ./

RUN npm ci --omit=dev

# ==========================================
# Copy backend source
# ==========================================
COPY . .

# ==========================================
# Production environment
# ==========================================
ENV NODE_ENV=production

# Render will provide PORT.
# Your application should use process.env.PORT.
EXPOSE 8000

# ==========================================
# Start Fusion backend
# ==========================================
CMD ["npm", "start"]