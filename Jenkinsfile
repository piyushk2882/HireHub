pipeline {
    agent any
    tools { nodejs 'node20' }

    stages {
        stage('Install') {
            steps {
                dir('client') {
                    sh 'npm ci'
                }
            }
        }
        stage('Build') {
            environment { NODE_OPTIONS = '--max-old-space-size=1024' }
            steps {
                dir('client') {
                    sh 'npm run build -- --configuration production'
                }
            }
        }
        stage('Deploy') {
            steps {
                sh '''
                  OUT=$(dirname "$(find client/dist -name index.html | head -n 1)")
                  echo "Deploying from $OUT"
                  rm -rf /var/www/angular-app/*
                  cp -r "$OUT"/* /var/www/angular-app/
                '''
            }
        }
    }
}