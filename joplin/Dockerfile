# A headless Joplin client. Scribe asks it to sync with your Joplin Server, and uses its API to read and write notes.
FROM node:22-bookworm
RUN npm install -g joplin@3.7.1 && npm cache clean --force
COPY agent.mjs entrypoint.sh /opt/scribe-joplin/
RUN sed -i "s/\r$//" /opt/scribe-joplin/entrypoint.sh && chmod +x /opt/scribe-joplin/entrypoint.sh
ENV NODE_ENV=production
EXPOSE 41186
CMD ["/opt/scribe-joplin/entrypoint.sh"]
