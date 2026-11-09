pipeline {
    agent any
    tools { nodejs 'node20' }

    stages {
        stage('Install') {
            steps { sh 'npm ci' }
        }
        stage('Build') {
            steps { sh 'npm run build -- --configuration production' }
        }
        stage('Deploy') {
            steps {
                sh '''
                  rm -rf /var/www/angular-app/*
                  cp -r dist/HireHub/browser/* /var/www/angular-app/
                '''
            }
        }
    }
}